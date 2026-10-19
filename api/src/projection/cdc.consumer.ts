import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka, logLevel } from 'kafkajs';
import { DebeziumEvent } from './debezium-event';
import { ProjectionService } from './projection.service';

/** Debezium names topics <topic.prefix>.<schema>.<table>. */
export const CDC_TOPICS = ['airline.public.airplanes', 'airline.public.seats'];

/**
 * Kafka consumer that feeds Debezium change events into the projectors.
 *
 * Offsets are committed only after ProjectionService.project() resolves, so a
 * crash mid-projection replays the event (at-least-once). If project() throws,
 * kafkajs retries the message and, after exhausting retries, restarts the
 * consumer from the last committed offset, so a poisoned event blocks the
 * partition rather than being silently skipped. Projectors are idempotent, so
 * redelivery is harmless.
 *
 * Because the broker buffers events, the API can be down for any length of
 * time: Debezium keeps publishing and the consumer catches up on restart.
 */
@Injectable()
export class CdcConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CdcConsumer.name);
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly groupId = process.env.KAFKA_GROUP_ID ?? 'airline-read-model-projector';

  constructor(private readonly projections: ProjectionService) {
    this.kafka = new Kafka({
      clientId: 'airline-api',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:29092').split(','),
      logLevel: logLevel.WARN,
    });
    this.consumer = this.kafka.consumer({ groupId: this.groupId });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureTopics();

    await this.consumer.connect();
    // fromBeginning only matters for a brand-new consumer group (first start / rebuild):
    // it replays everything the broker retained, which rebuilds the read models from scratch.
    await this.consumer.subscribe({ topics: CDC_TOPICS, fromBeginning: true });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) {
          return; // Kafka tombstone (disabled in Debezium config, but be safe)
        }
        const event = JSON.parse(message.value.toString()) as DebeziumEvent;
        this.logger.debug(`${topic}[${partition}]@${message.offset} op=${event.op}`);
        await this.projections.project(event);
      },
    });

    this.logger.log(`consuming ${CDC_TOPICS.join(', ')} as group "${this.groupId}"`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  /** Create the topics up front so the consumer never waits on broker auto-creation. Idempotent. */
  private async ensureTopics(): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();
    try {
      await admin.createTopics({
        waitForLeaders: true,
        topics: CDC_TOPICS.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
      });
    } finally {
      await admin.disconnect();
    }
  }
}
