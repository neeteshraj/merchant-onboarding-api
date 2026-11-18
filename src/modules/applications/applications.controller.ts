import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditLogResponseDto } from '../audit/dto/audit-log-response.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { Role } from '../users/enums/role.enum.js';
import { ApplicationsService } from './applications.service.js';
import {
  ApplicationListResponseDto,
  ApplicationResponseDto,
} from './dto/application-response.dto.js';
import { AssignReviewerDto } from './dto/assign-reviewer.dto.js';
import { CreateApplicationDto } from './dto/create-application.dto.js';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto.js';
import { RecordDecisionDto } from './dto/record-decision.dto.js';
import { UpdateApplicationDto } from './dto/update-application.dto.js';

const IdParam = () => Param('id', new ParseUUIDPipe({ version: '4' }));

@ApiTags('applications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@ApiForbiddenResponse({ description: 'Role or ownership does not permit this action' })
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @Roles(Role.Sales, Role.Admin)
  @ApiOperation({ summary: 'Create a draft merchant application' })
  @ApiCreatedResponse({ type: ApplicationResponseDto })
  async create(
    @Body() dto: CreateApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationResponseDto> {
    return ApplicationResponseDto.fromEntity(await this.applications.create(dto, user));
  }

  @Get()
  @ApiOperation({
    summary: 'List applications visible to the caller',
    description: 'SALES see their own, REVIEWERs see those assigned to them, ADMIN sees all.',
  })
  @ApiOkResponse({ type: ApplicationListResponseDto })
  async list(
    @Query() query: ListApplicationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationListResponseDto> {
    const page = await this.applications.list(query, user);
    return { data: page.data.map(ApplicationResponseDto.fromEntity), meta: page.meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an application by id' })
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiNotFoundResponse({ description: 'Not found or not visible to the caller' })
  async findOne(
    @IdParam() id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationResponseDto> {
    return ApplicationResponseDto.fromEntity(await this.applications.findOne(id, user));
  }

  @Patch(':id')
  @Roles(Role.Sales, Role.Admin)
  @ApiOperation({ summary: 'Update an application while DRAFT or INFO_REQUESTED' })
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiNotFoundResponse({ description: 'Not found or not visible to the caller' })
  @ApiConflictResponse({ description: 'Application is not editable in its current status' })
  async update(
    @IdParam() id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationResponseDto> {
    return ApplicationResponseDto.fromEntity(await this.applications.update(id, dto, user));
  }

  @Post(':id/submit')
  @Roles(Role.Sales, Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit for review; enqueues an asynchronous risk review' })
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiConflictResponse({ description: 'Invalid status transition' })
  async submit(
    @IdParam() id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationResponseDto> {
    return ApplicationResponseDto.fromEntity(await this.applications.submit(id, user));
  }

  @Post(':id/assign')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign or reassign a reviewer' })
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiConflictResponse({ description: 'Application is not awaiting review' })
  async assign(
    @IdParam() id: string,
    @Body() dto: AssignReviewerDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationResponseDto> {
    return ApplicationResponseDto.fromEntity(
      await this.applications.assignReviewer(id, dto.reviewerId, user),
    );
  }

  @Post(':id/decision')
  @Roles(Role.Reviewer)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve, reject or request more information (assigned reviewer only)' })
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiConflictResponse({ description: 'Invalid transition or risk review not completed' })
  async decide(
    @IdParam() id: string,
    @Body() dto: RecordDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationResponseDto> {
    return ApplicationResponseDto.fromEntity(await this.applications.recordDecision(id, dto, user));
  }

  @Post(':id/risk-review')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a new risk review after a failed or lost one' })
  @ApiAcceptedResponse({ type: ApplicationResponseDto })
  @ApiConflictResponse({ description: 'Risk review is not in a retryable state' })
  async requeueRiskReview(
    @IdParam() id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationResponseDto> {
    return ApplicationResponseDto.fromEntity(await this.applications.requeueRiskReview(id, user));
  }

  @Get(':id/audit-logs')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Audit trail for an application, oldest first' })
  @ApiOkResponse({ type: [AuditLogResponseDto] })
  async auditTrail(
    @IdParam() id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuditLogResponseDto[]> {
    const logs = await this.applications.auditTrail(id, user);
    return logs.map(AuditLogResponseDto.fromEntity);
  }
}
