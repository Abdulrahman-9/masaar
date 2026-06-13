import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CompleteStageDto, CreateTenderDto, ReturnDto, SetPriceDto } from './dto.js';
import { TendersService } from './tenders.service.js';

@Controller('tenders')
export class TendersController {
  constructor(private readonly tenders: TendersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.tenders.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenders.get(user, id);
  }

  @Post()
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenderDto) {
    return this.tenders.create(user, dto);
  }

  @Post(':id/publish')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenders.publishAnnouncement(user, id);
  }

  @Post(':id/price')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN')
  setPrice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetPriceDto) {
    return this.tenders.setPrice(user, id, dto.bidderId, dto.priceUSD);
  }

  @Post(':id/complete-stage')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN')
  completeStage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteStageDto) {
    return this.tenders.completeStage(user, id, dto);
  }

  // award decisions — ROC only (ratify above-FA awards / governance)
  @Post(':id/ratify')
  @Roles('ROC_ADMIN', 'SUPER_ADMIN')
  ratify(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenders.ratify(user, id);
  }

  @Post(':id/return')
  @Roles('ROC_ADMIN', 'SUPER_ADMIN')
  returnWithNotes(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReturnDto) {
    return this.tenders.returnWithNotes(user, id, dto.notes);
  }
}
