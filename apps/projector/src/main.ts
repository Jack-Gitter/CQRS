import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProjectorModule } from './projector.module';

/**
 * The projector is a headless Nest application: no HTTP server, just the Kafka
 * consumer and the projectors. It can be scaled and restarted independently of
 * the command/query API.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(ProjectorModule);
  app.enableShutdownHooks();
  new Logger('Bootstrap').log('projector running');
}

void bootstrap();
