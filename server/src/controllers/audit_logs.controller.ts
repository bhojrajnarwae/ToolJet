import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../src/modules/auth/jwt-auth.guard';
import { PoliciesGuard } from 'src/modules/casl/policies.guard';
import { CheckPolicies } from 'src/modules/casl/check_policies.decorator';
import { AppAbility } from 'src/modules/casl/casl-ability.factory';
import { User as UserEntity } from 'src/entities/user.entity';
import { AuditLogsQueryService } from '@services/audit_logs_query.service';
import { LicenseService } from '@services/license.service';
import { decamelizeKeys } from 'humps';
import { AuditLogsEnabledGuard, AuditLogsDurationGuard } from '@ee/licensing/guards/auditLog.guard';
import { User } from 'src/decorators/user.decorator';
import { LICENSE_FIELD } from 'src/helpers/license.helper';

@Controller('audit_logs')
export class AuditLogsController {
  constructor(private auditLogsQueryService: AuditLogsQueryService, private licenseService: LicenseService) {}

  @UseGuards(JwtAuthGuard, PoliciesGuard, AuditLogsDurationGuard)
  @CheckPolicies((ability: AppAbility) => ability.can('accessAuditLogs', UserEntity))
  @Get()
  async index(@User() user, @Query() query): Promise<object> {
    const { resources, actions, timeFrom, timeTo, users, apps } = query;
    const searchParams = { resources, actions, timeFrom, timeTo, users, apps };
    const page = parseInt(query.page || 1);
    const perPage = parseInt(query.perPage || 50);
    const auditLogs = await this.auditLogsQueryService.findPerPage(user, page, perPage, searchParams);
    const totalCount = await this.auditLogsQueryService.count(user, searchParams);
    const meta = {
      totalPages: Math.ceil(totalCount / perPage),
      totalCount,
      currentPage: page,
    };

    return decamelizeKeys({ auditLogs, meta });
  }

  @UseGuards(JwtAuthGuard, AuditLogsEnabledGuard)
  @Get('license_terms')
  async getAuditLog() {
    return;
  }

  @UseGuards(JwtAuthGuard, AuditLogsEnabledGuard)
  @Get('max_duration')
  @CheckPolicies((ability: AppAbility) => ability.can('accessAuditLogs', UserEntity))
  async getMaxDuration() {
    const data = await this.licenseService.getLicenseTerms(LICENSE_FIELD.MAX_DURATION_FOR_AUDIT_LOGS);
    return data;
  }
}
