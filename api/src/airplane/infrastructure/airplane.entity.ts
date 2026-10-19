import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { NumericTransformer } from '../../common/numeric.transformer';
import { SeatEntity } from './seat.entity';

/**
 * Persistence model for the write database. Deliberately separate from the
 * domain Airplane class: TypeORM maps rows, the aggregate enforces rules.
 */
@Entity({ name: 'airplanes' })
export class AirplaneEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'tail_number', type: 'text', unique: true })
  tailNumber: string;

  @Column({ type: 'text' })
  model: string;

  @Column({ name: 'base_ticket_price', type: 'numeric', precision: 10, scale: 2, transformer: NumericTransformer })
  baseTicketPrice: number;

  @Column({ type: 'text' })
  status: string;

  @Column({ type: 'integer', default: 0 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SeatEntity, (seat) => seat.airplane)
  seats: SeatEntity[];
}
