import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique } from 'typeorm';
import { AirplaneEntity } from './airplane.entity';

@Entity({ name: 'seats' })
@Unique(['airplaneId', 'seatNumber'])
export class SeatEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'airplane_id', type: 'uuid' })
  airplaneId: string;

  @ManyToOne(() => AirplaneEntity, (airplane) => airplane.seats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'airplane_id' })
  airplane: AirplaneEntity;

  @Column({ name: 'seat_number', type: 'text' })
  seatNumber: string;

  @Column({ name: 'cabin_class', type: 'text' })
  cabinClass: string;

  @Column({ type: 'text' })
  status: string;

  @Column({ name: 'passenger_name', type: 'text', nullable: true })
  passengerName: string | null;

  @Column({ name: 'booked_at', type: 'timestamptz', nullable: true })
  bookedAt: Date | null;
}
