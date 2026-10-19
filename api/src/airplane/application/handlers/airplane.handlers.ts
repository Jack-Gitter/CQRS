import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Airplane } from '../../domain/airplane';
import { AirplaneUnitOfWork } from '../airplane-unit-of-work';
import {
  BookSeatCommand,
  CancelSeatCommand,
  ChangeBasePriceCommand,
  CommandResult,
  CreateAirplaneCommand,
  GroundAirplaneCommand,
  ReactivateAirplaneCommand,
} from '../commands/commands';

@CommandHandler(CreateAirplaneCommand)
export class CreateAirplaneHandler implements ICommandHandler<CreateAirplaneCommand, CommandResult> {
  constructor(private readonly uow: AirplaneUnitOfWork) {}

  execute(cmd: CreateAirplaneCommand): Promise<CommandResult> {
    return this.uow.create(
      Airplane.create({
        tailNumber: cmd.tailNumber,
        model: cmd.model,
        baseTicketPrice: cmd.baseTicketPrice,
        layout: cmd.layout,
      }),
    );
  }
}

@CommandHandler(BookSeatCommand)
export class BookSeatHandler implements ICommandHandler<BookSeatCommand, CommandResult> {
  constructor(private readonly uow: AirplaneUnitOfWork) {}

  execute(cmd: BookSeatCommand): Promise<CommandResult> {
    return this.uow.mutate(cmd.airplaneId, (airplane) => airplane.bookSeat(cmd.seatNumber, cmd.passengerName));
  }
}

@CommandHandler(CancelSeatCommand)
export class CancelSeatHandler implements ICommandHandler<CancelSeatCommand, CommandResult> {
  constructor(private readonly uow: AirplaneUnitOfWork) {}

  execute(cmd: CancelSeatCommand): Promise<CommandResult> {
    return this.uow.mutate(cmd.airplaneId, (airplane) => airplane.cancelSeat(cmd.seatNumber));
  }
}

@CommandHandler(ChangeBasePriceCommand)
export class ChangeBasePriceHandler implements ICommandHandler<ChangeBasePriceCommand, CommandResult> {
  constructor(private readonly uow: AirplaneUnitOfWork) {}

  execute(cmd: ChangeBasePriceCommand): Promise<CommandResult> {
    return this.uow.mutate(cmd.airplaneId, (airplane) => airplane.changeBasePrice(cmd.baseTicketPrice));
  }
}

@CommandHandler(GroundAirplaneCommand)
export class GroundAirplaneHandler implements ICommandHandler<GroundAirplaneCommand, CommandResult> {
  constructor(private readonly uow: AirplaneUnitOfWork) {}

  execute(cmd: GroundAirplaneCommand): Promise<CommandResult> {
    return this.uow.mutate(cmd.airplaneId, (airplane) => airplane.ground());
  }
}

@CommandHandler(ReactivateAirplaneCommand)
export class ReactivateAirplaneHandler implements ICommandHandler<ReactivateAirplaneCommand, CommandResult> {
  constructor(private readonly uow: AirplaneUnitOfWork) {}

  execute(cmd: ReactivateAirplaneCommand): Promise<CommandResult> {
    return this.uow.mutate(cmd.airplaneId, (airplane) => airplane.reactivate());
  }
}

export const COMMAND_HANDLERS = [
  CreateAirplaneHandler,
  BookSeatHandler,
  CancelSeatHandler,
  ChangeBasePriceHandler,
  GroundAirplaneHandler,
  ReactivateAirplaneHandler,
];
