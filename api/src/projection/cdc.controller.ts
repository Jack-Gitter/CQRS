import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DebeziumEvent } from './debezium-event';
import { ProjectionService } from './projection.service';

/**
 * Target of Debezium Server's HTTP sink. One POST per WAL change, in commit order.
 * Returning 2xx acknowledges the event (Debezium then advances its offset);
 * any error -> non-2xx -> Debezium retries the same event (at-least-once),
 * which is why the projectors are idempotent.
 *
 * In a real deployment this endpoint would sit on an internal network / require auth.
 */
@Controller('internal/cdc')
export class CdcController {
  constructor(private readonly projections: ProjectionService) {}

  @Post()
  @HttpCode(200)
  async receive(@Body() event: DebeziumEvent): Promise<{ ok: true }> {
    await this.projections.project(event);
    return { ok: true };
  }
}
