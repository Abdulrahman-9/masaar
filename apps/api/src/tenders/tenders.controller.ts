import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  AddBidderDto,
  AnnouncementPatchDto,
  CompleteStageDto,
  CreateTenderDto,
  EvalStepDto,
  PlanStageDto,
  ReturnDto,
  SetPriceDto,
  SetTechnicalDto,
  ToggleDocDto,
} from './dto.js';
import { TendersService } from './tenders.service.js';

const OPERATOR_ROLES = ['OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN'] as const;

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

  /* intra-stage editor mutations */

  @Patch(':id/plan')
  @Roles(...OPERATOR_ROLES)
  planStage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlanStageDto) {
    return this.tenders.planStage(user, id, dto.stageKey, dto.plannedFrom, dto.plannedTo);
  }

  @Patch(':id/announcement')
  @Roles(...OPERATOR_ROLES)
  patchAnnouncement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AnnouncementPatchDto) {
    return this.tenders.patchAnnouncement(user, id, dto as Record<string, unknown>);
  }

  @Patch(':id/eval-step')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN')
  setEvalStep(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: EvalStepDto) {
    return this.tenders.setEvalStep(user, id, dto.step);
  }

  @Post(':id/bidders')
  @Roles(...OPERATOR_ROLES)
  addBidder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddBidderDto) {
    return this.tenders.addBidder(user, id, dto.name);
  }

  @Patch(':id/technical')
  @Roles('OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN')
  setTechnical(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetTechnicalDto) {
    return this.tenders.setTechnical(user, id, dto.bidderId, dto.result as 'pass' | 'fail');
  }

  @Patch(':id/document')
  @Roles(...OPERATOR_ROLES)
  toggleDoc(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ToggleDocDto) {
    return this.tenders.toggleDoc(user, id, dto.stageKey, dto.doc);
  }
}
