import { IsEnum, IsNumber, IsOptional, IsString, IsBoolean } from 'class-validator';
import { TicketPriority, TicketStatus } from '@prisma/client';

export class CreateTicketDto {
  @IsOptional()
  @IsNumber()
  orderId?: number;

  @IsString()
  subject: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsNumber()
  assignedTo?: number;
}

export class AddNoteDto {
  @IsString()
  body: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

export class AdminNoteDto {
  @IsString()
  targetType: string;

  @IsNumber()
  targetId: number;

  @IsString()
  body: string;
}
