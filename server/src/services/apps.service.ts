import { BadRequestException, Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { App } from 'src/entities/app.entity';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { AppUser } from 'src/entities/app_user.entity';
import { AppVersion } from 'src/entities/app_version.entity';
import { DataSource } from 'src/entities/data_source.entity';
import { DataQuery } from 'src/entities/data_query.entity';
import { GroupPermission } from 'src/entities/group_permission.entity';
import { AppGroupPermission } from 'src/entities/app_group_permission.entity';
import { AppImportExportService } from './app_import_export.service';
import { DataSourcesService } from './data_sources.service';
import { Credential } from 'src/entities/credential.entity';
import {
  cleanObject,
  dbTransactionWrap,
  generatePayloadForLimits,
  catchDbException,
  defaultAppEnvironments,
} from 'src/helpers/utils.helper';
import { AppUpdateDto } from '@dto/app-update.dto';
import { viewableAppsQuery } from 'src/helpers/queries';
import { VersionEditDto } from '@dto/version-edit.dto';
import { AppEnvironment } from 'src/entities/app_environments.entity';
import { DataSourceOptions } from 'src/entities/data_source_options.entity';
import { AppEnvironmentService } from './app_environments.service';
import { decode } from 'js-base64';
import { DataSourceScopes } from 'src/helpers/data_source.constants';
import { LicenseService } from './license.service';
import { LICENSE_FIELD, LICENSE_LIMIT, LICENSE_LIMITS_LABEL } from 'src/helpers/license.helper';
import { DataBaseConstraints } from 'src/helpers/db_constraints.constants';

@Injectable()
export class AppsService {
  constructor(
    @InjectRepository(App)
    private appsRepository: Repository<App>,

    @InjectRepository(AppVersion)
    private appVersionsRepository: Repository<AppVersion>,

    @InjectRepository(AppUser)
    private appUsersRepository: Repository<AppUser>,

    private appImportExportService: AppImportExportService,
    private dataSourcesService: DataSourcesService,
    private appEnvironmentService: AppEnvironmentService,
    private licenseService: LicenseService
  ) {}
  async find(id: string): Promise<App> {
    return this.appsRepository.findOne({
      where: { id },
    });
  }

  async findBySlug(slug: string): Promise<App> {
    return await this.appsRepository.findOne({
      where: {
        slug,
      },
    });
  }

  async findVersion(id: string): Promise<AppVersion> {
    const appVersion = await this.appVersionsRepository.findOneOrFail({
      where: { id },
      relations: [
        'app',
        'dataQueries',
        'dataQueries.dataSource',
        'dataQueries.plugins',
        'dataQueries.plugins.manifestFile',
      ],
    });

    if (appVersion?.dataQueries) {
      // eslint-disable-next-line no-unsafe-optional-chaining
      for (const query of appVersion?.dataQueries) {
        if (query?.plugin) {
          query.plugin.manifestFile.data = JSON.parse(decode(query.plugin.manifestFile.data.toString('utf8')));
        }
      }
    }

    return appVersion;
  }

  async findAppFromVersion(id: string): Promise<App> {
    return (
      await this.appVersionsRepository.findOneOrFail({
        where: { id },
        relations: ['app'],
      })
    ).app;
  }

  async findVersionFromName(name: string, appId: string): Promise<AppVersion> {
    return await this.appVersionsRepository.findOne({
      where: { name, appId },
    });
  }

  async findDataQueriesForVersion(appVersionId: string): Promise<DataQuery[]> {
    return await dbTransactionWrap(async (manager: EntityManager) => {
      return manager
        .createQueryBuilder(DataQuery, 'data_query')
        .innerJoin('data_query.dataSource', 'data_source')
        .addSelect('data_source.kind')
        .where('data_query.appVersionId = :appVersionId', { appVersionId })
        .getMany();
    });
  }

  async create(name: string, user: User, type: string, manager: EntityManager): Promise<App> {
    return await dbTransactionWrap(async (manager: EntityManager) => {
      return await catchDbException(async () => {
        const app = await manager.save(
          manager.create(App, {
            type,
            name,
            createdAt: new Date(),
            updatedAt: new Date(),
            organizationId: user.organizationId,
            userId: user.id,
            isMaintenanceOn: type === 'workflow' ? true : false,
          })
        );

        //create default app version
        await this.createVersion(user, app, 'v1', null, null, manager);

        await manager.save(
          manager.create(AppUser, {
            userId: user.id,
            appId: app.id,
            role: 'admin',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        );

        await this.createAppGroupPermissionsForAdmin(app, manager);
        return app;
      }, [{ dbConstraint: DataBaseConstraints.APP_NAME_UNIQUE, message: 'This app name is already taken.' }]);
    }, manager);
  }

  async createAppGroupPermissionsForAdmin(app: App, manager: EntityManager): Promise<void> {
    await dbTransactionWrap(async (manager: EntityManager) => {
      const orgDefaultGroupPermissions = await manager.find(GroupPermission, {
        where: {
          organizationId: app.organizationId,
          group: 'admin',
        },
      });

      for (const groupPermission of orgDefaultGroupPermissions) {
        const appGroupPermission = manager.create(AppGroupPermission, {
          groupPermissionId: groupPermission.id,
          appId: app.id,
          ...this.fetchDefaultAppGroupPermissions(groupPermission.group),
        });

        await manager.save(appGroupPermission);
      }
    }, manager);
  }

  fetchDefaultAppGroupPermissions(group: string): {
    read: boolean;
    update: boolean;
    delete: boolean;
  } {
    switch (group) {
      case 'all_users':
        return { read: true, update: false, delete: false };
      case 'admin':
        return { read: true, update: true, delete: true };
      default:
        throw `${group} is not a default group`;
    }
  }

  async clone(existingApp: App, user: User, appName: string): Promise<App> {
    const appWithRelations = await this.appImportExportService.export(user, existingApp.id);
    const clonedApp = await this.appImportExportService.import(user, appWithRelations, appName);

    return clonedApp;
  }

  async count(user: User, searchKey, type: string, from?: string): Promise<number> {
    return await viewableAppsQuery(
      user,
      await this.licenseService.getLicenseTerms(LICENSE_FIELD.VALID),
      searchKey,
      [],
      type
    ).getCount();
  }

  getAppVersionsCount = async (appId: string) => {
    return await this.appVersionsRepository.count({
      where: { appId },
    });
  };

  async all(user: User, page: number, searchKey: string, type: string): Promise<App[]> {
    const viewableAppsQb = viewableAppsQuery(
      user,
      await this.licenseService.getLicenseTerms(LICENSE_FIELD.VALID),
      searchKey,
      undefined,
      type
    );

    if (page) {
      return await viewableAppsQb
        .take(9)
        .skip(9 * (page - 1))
        .getMany();
    }

    return await viewableAppsQb.getMany();
  }

  async getWorkflows() {
    const workflowApps = await this.appsRepository.find({
      where: { type: 'workflow' },
    });

    const result = workflowApps.map((workflowApp) => ({ id: workflowApp.id, name: workflowApp.name }));

    return result;
  }

  async update(appId: string, appUpdateDto: AppUpdateDto, manager?: EntityManager) {
    const currentVersionId = appUpdateDto.current_version_id;
    const isPublic = appUpdateDto.is_public;
    const isMaintenanceOn = appUpdateDto.is_maintenance_on;
    const { name, slug, icon } = appUpdateDto;

    const updatableParams = {
      name,
      slug,
      isPublic,
      isMaintenanceOn,
      currentVersionId,
      icon,
    };

    // removing keys with undefined values
    cleanObject(updatableParams);
    return await dbTransactionWrap(async (manager: EntityManager) => {
      if (updatableParams.currentVersionId) {
        //check if the app version is eligible for release
        const currentEnvironment: AppEnvironment = await manager
          .createQueryBuilder(AppEnvironment, 'app_environments')
          .select(['app_environments.id', 'app_environments.isDefault'])
          .innerJoinAndSelect(
            'app_versions',
            'app_versions',
            'app_versions.current_environment_id = app_environments.id'
          )
          .where('app_versions.id = :currentVersionId', {
            currentVersionId,
          })
          .getOne();

        if (!currentEnvironment?.isDefault) {
          throw new BadRequestException('You can only release when the version is promoted to production');
        }
      }
      return await catchDbException(async () => {
        return await manager.update(App, appId, updatableParams);
      }, [
        { dbConstraint: DataBaseConstraints.APP_NAME_UNIQUE, message: 'This app name is already taken.' },
        { dbConstraint: DataBaseConstraints.APP_SLUG_UNIQUE, message: 'This app slug is already taken.' },
      ]);
    }, manager);
  }

  async delete(appId: string) {
    await dbTransactionWrap(async (manager: EntityManager) => {
      await manager.delete(App, { id: appId });
    });
    return;
  }

  async isAppPublic(appId: string): Promise<boolean> {
    const app = await this.appsRepository.findOne(appId);
    return app.isPublic;
  }

  async fetchUsers(appId: string): Promise<AppUser[]> {
    const appUsers = await this.appUsersRepository.find({
      where: { appId },
      relations: ['user'],
    });

    // serialize
    const serializedUsers = [];
    for (const appUser of appUsers) {
      serializedUsers.push({
        email: appUser.user.email,
        firstName: appUser.user.firstName,
        lastName: appUser.user.lastName,
        name: `${appUser.user.firstName} ${appUser.user.lastName}`,
        id: appUser.id,
        role: appUser.role,
      });
    }

    return serializedUsers;
  }

  async fetchVersions(user: any, appId: string): Promise<AppVersion[]> {
    return await this.appVersionsRepository.find({
      where: { appId },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async createVersion(
    user: User,
    app: App,
    versionName: string,
    versionFromId: string,
    environmentId: string,
    manager?: EntityManager
  ): Promise<AppVersion> {
    return await dbTransactionWrap(async (manager: EntityManager) => {
      let versionFrom: AppVersion;
      const { organizationId } = user;
      if (versionFromId) {
        versionFrom = await manager.findOneOrFail(AppVersion, {
          where: { id: versionFromId },
          relations: ['dataSources', 'dataSources.dataQueries', 'dataSources.dataSourceOptions'],
        });

        if (defaultAppEnvironments.length > 1) {
          const environmentWhereUserCreatingVersion = await this.appEnvironmentService.get(
            app.organizationId,
            environmentId,
            false,
            manager
          );

          //check if the user is creating version from development environment only
          if (environmentWhereUserCreatingVersion.priority !== 1) {
            throw new BadRequestException('New versions can only be created in development environment');
          }
        }
      }

      const noOfVersions = await manager.count(AppVersion, { where: { appId: app?.id } });

      if (noOfVersions && !versionFrom) {
        throw new BadRequestException('Version from should not be empty');
      }

      const versionNameExists = await manager.findOne(AppVersion, {
        where: { name: versionName, appId: app.id },
      });

      if (versionNameExists) {
        throw new BadRequestException('Version name already exists.');
      }

      const firstPriorityEnv = await this.appEnvironmentService.get(organizationId, null, true, manager);

      const appVersion = await manager.save(
        AppVersion,
        manager.create(AppVersion, {
          name: versionName,
          appId: app.id,
          definition: versionFrom?.definition,
          currentEnvironmentId: firstPriorityEnv?.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      await this.createNewDataSourcesAndQueriesForVersion(manager, appVersion, versionFrom, organizationId, app.type);
      return appVersion;
    }, manager);
  }

  async deleteVersion(app: App, version: AppVersion): Promise<void> {
    if (app.currentVersionId === version.id) {
      throw new BadRequestException('You cannot delete a released version');
    }

    await dbTransactionWrap(async (manager: EntityManager) => {
      await manager.delete(AppVersion, {
        id: version.id,
        appId: app.id,
      });
    });
  }

  async createNewDataSourcesAndQueriesForVersion(
    manager: EntityManager,
    appVersion: AppVersion,
    versionFrom: AppVersion,
    organizationId: string,
    appType: string
  ) {
    const oldDataQueryToNewMapping = {};

    let appEnvironments: AppEnvironment[] = await this.appEnvironmentService.getAll(organizationId, manager);

    if (!appEnvironments?.length) {
      await this.createEnvironments(defaultAppEnvironments, manager, organizationId);
      appEnvironments = await this.appEnvironmentService.getAll(organizationId, manager);
    }

    if (!versionFrom) {
      //create default data sources
      for (const defaultSource of ['restapi', 'runjs', 'tooljetdb', 'workflows']) {
        const dataSource = await this.dataSourcesService.createDefaultDataSource(
          defaultSource,
          appVersion.id,
          null,
          manager
        );
        await this.appEnvironmentService.createDataSourceInAllEnvironments(organizationId, dataSource.id, manager);
      }
    } else {
      const globalQueries: DataQuery[] = await manager
        .createQueryBuilder(DataQuery, 'data_query')
        .leftJoinAndSelect('data_query.dataSource', 'dataSource')
        .where('data_query.appVersionId = :appVersionId', { appVersionId: versionFrom?.id })
        .andWhere('dataSource.scope = :scope', { scope: DataSourceScopes.GLOBAL })
        .getMany();
      const dataSources = versionFrom?.dataSources;
      const dataSourceMapping = {};
      const newDataQueries = [];

      if (dataSources?.length) {
        for (const dataSource of dataSources) {
          const dataSourceParams: Partial<DataSource> = {
            name: dataSource.name,
            kind: dataSource.kind,
            type: dataSource.type,
            appVersionId: appVersion.id,
          };
          const newDataSource = await manager.save(manager.create(DataSource, dataSourceParams));
          dataSourceMapping[dataSource.id] = newDataSource.id;

          const dataQueries = versionFrom?.dataSources?.find((ds) => ds.id === dataSource.id).dataQueries;

          for (const dataQuery of dataQueries) {
            const dataQueryParams = {
              name: dataQuery.name,
              options: dataQuery.options,
              dataSourceId: newDataSource.id,
              appVersionId: appVersion.id,
            };

            const newQuery = await manager.save(manager.create(DataQuery, dataQueryParams));
            oldDataQueryToNewMapping[dataQuery.id] = newQuery.id;
            newDataQueries.push(newQuery);
          }
        }

        if (globalQueries?.length) {
          for (const globalQuery of globalQueries) {
            const dataQueryParams = {
              name: globalQuery.name,
              options: globalQuery.options,
              dataSourceId: globalQuery.dataSourceId,
              appVersionId: appVersion.id,
            };

            const newQuery = await manager.save(manager.create(DataQuery, dataQueryParams));
            oldDataQueryToNewMapping[globalQuery.id] = newQuery.id;
            newDataQueries.push(newQuery);
          }
        }

        for (const newQuery of newDataQueries) {
          const newOptions = this.replaceDataQueryOptionsWithNewDataQueryIds(
            newQuery.options,
            oldDataQueryToNewMapping
          );
          newQuery.options = newOptions;
          await manager.save(newQuery);
        }

        appVersion.definition = this.replaceDataQueryIdWithinDefinitions(
          appVersion.definition,
          oldDataQueryToNewMapping
        );
        await manager.save(appVersion);

        for (const appEnvironment of appEnvironments) {
          for (const dataSource of dataSources) {
            const dataSourceOption = await manager.findOneOrFail(DataSourceOptions, {
              where: { dataSourceId: dataSource.id, environmentId: appEnvironment.id },
            });

            const convertedOptions = this.convertToArrayOfKeyValuePairs(dataSourceOption.options);
            const newOptions = await this.dataSourcesService.parseOptionsForCreate(convertedOptions, false, manager);
            await this.setNewCredentialValueFromOldValue(newOptions, convertedOptions, manager);

            await manager.save(
              manager.create(DataSourceOptions, {
                options: newOptions,
                dataSourceId: dataSourceMapping[dataSource.id],
                environmentId: appEnvironment.id,
              })
            );
          }
        }
      }
    }
  }

  async createNewQueriesForWorkflowVersion(
    manager: EntityManager,
    appVersion: AppVersion,
    versionFrom: AppVersion,
    organizationId: string
  ) {}

  private async createEnvironments(appEnvironments: any[], manager: EntityManager, organizationId: string) {
    for (const appEnvironment of appEnvironments) {
      await this.appEnvironmentService.create(
        organizationId,
        appEnvironment.name,
        appEnvironment.isDefault,
        appEnvironment.priority,
        manager
      );
    }
  }

  replaceDataQueryOptionsWithNewDataQueryIds(options, dataQueryMapping) {
    if (options && options.events) {
      const replacedEvents = options.events.map((event) => {
        if (event.queryId) {
          event.queryId = dataQueryMapping[event.queryId];
        }
        return event;
      });
      options.events = replacedEvents;
    }
    return options;
  }

  replaceDataQueryIdWithinDefinitions(definition, dataQueryMapping) {
    if (definition?.pages) {
      for (const pageId of Object.keys(definition?.pages)) {
        if (definition.pages[pageId].events) {
          const replacedPageEvents = definition.pages[pageId].events.map((event) => {
            if (event.queryId) {
              event.queryId = dataQueryMapping[event.queryId];
            }
            return event;
          });
          definition.pages[pageId].events = replacedPageEvents;
        }
        if (definition.pages[pageId].components) {
          for (const id of Object.keys(definition.pages[pageId].components)) {
            const component = definition.pages[pageId].components[id].component;

            if (component?.definition?.events) {
              const replacedComponentEvents = component.definition.events.map((event) => {
                if (event.queryId) {
                  event.queryId = dataQueryMapping[event.queryId];
                }
                return event;
              });
              component.definition.events = replacedComponentEvents;
            }

            if (component?.definition?.properties?.actions?.value) {
              for (const value of component.definition.properties.actions.value) {
                if (value?.events) {
                  const replacedComponentActionEvents = value.events.map((event) => {
                    if (event.queryId) {
                      event.queryId = dataQueryMapping[event.queryId];
                    }
                    return event;
                  });
                  value.events = replacedComponentActionEvents;
                }
              }
            }

            if (component?.component === 'Table') {
              for (const column of component?.definition?.properties?.columns?.value ?? []) {
                if (column?.events) {
                  const replacedComponentActionEvents = column.events.map((event) => {
                    if (event.queryId) {
                      event.queryId = dataQueryMapping[event.queryId];
                    }
                    return event;
                  });
                  column.events = replacedComponentActionEvents;
                }
              }
            }

            definition.pages[pageId].components[id].component = component;
          }
        }
      }
    }
    return definition;
  }

  replaceQueryMappingsInWorkflowDefinition(definition, dataQueryMapping) {
    const newQueries = definition.queries.map((query) => ({
      ...query,
      id: dataQueryMapping[query.id],
    }));

    const newDefinition = {
      ...definition,
      queries: newQueries,
    };

    return newDefinition;
  }

  async setNewCredentialValueFromOldValue(newOptions: any, oldOptions: any, manager: EntityManager) {
    const newOptionsWithCredentials = this.convertToArrayOfKeyValuePairs(newOptions).filter((opt) => opt['encrypted']);

    for (const newOption of newOptionsWithCredentials) {
      const oldOption = oldOptions.find((oldOption) => oldOption['key'] == newOption['key']);
      const oldCredential = await manager.findOne(Credential, {
        where: { id: oldOption.credential_id },
      });
      const newCredential = await manager.findOne(Credential, {
        where: { id: newOption['credential_id'] },
      });
      newCredential.valueCiphertext = oldCredential.valueCiphertext;

      await manager.save(newCredential);
    }
  }

  async updateVersion(version: AppVersion, body: VersionEditDto, organizationId: string) {
    const { name, currentEnvironmentId, definition } = body;
    let currentEnvironment: AppEnvironment;

    if (version.id === version.app.currentVersionId && !body?.is_user_switched_version)
      throw new BadRequestException('You cannot update a released version');

    if (currentEnvironmentId || definition) {
      currentEnvironment = await AppEnvironment.findOne({
        where: { id: version.currentEnvironmentId },
      });
    }

    const editableParams = {};
    if (name) {
      //means user is trying to update the name
      const versionNameExists = await this.appVersionsRepository.findOne({
        where: { name, appId: version.appId },
      });

      if (versionNameExists) {
        throw new BadRequestException('Version name already exists.');
      }
      editableParams['name'] = name;
    }

    //check if the user is trying to promote the environment & raise an error if the currentEnvironmentId is not correct
    if (currentEnvironmentId) {
      if (!(await this.licenseService.getLicenseTerms(LICENSE_FIELD.MULTI_ENVIRONMENT))) {
        throw new BadRequestException('You do not have permissions to perform this action');
      }

      if (version.currentEnvironmentId !== currentEnvironmentId) {
        throw new NotAcceptableException();
      }
      const nextEnvironment = await AppEnvironment.findOne({
        select: ['id'],
        where: {
          priority: MoreThan(currentEnvironment.priority),
          organizationId,
        },
        order: { priority: 'ASC' },
      });
      editableParams['currentEnvironmentId'] = nextEnvironment.id;
    }

    if (definition) {
      const environments = await AppEnvironment.count({
        where: {
          organizationId,
        },
      });
      if (environments > 1 && currentEnvironment.priority !== 1 && !body?.is_user_switched_version) {
        throw new BadRequestException('You cannot update a promoted version');
      }
      editableParams['definition'] = definition;
    }

    editableParams['updatedAt'] = new Date();

    return await this.appVersionsRepository.update(version.id, editableParams);
  }

  convertToArrayOfKeyValuePairs(options): Array<object> {
    if (!options) return;
    return Object.keys(options).map((key) => {
      return {
        key: key,
        value: options[key]['value'],
        encrypted: options[key]['encrypted'],
        credential_id: options[key]['credential_id'],
      };
    });
  }

  async appsCount() {
    return await this.appsRepository.count();
  }

  async getAppsLimit() {
    const licenseTerms = await this.licenseService.getLicenseTerms([LICENSE_FIELD.APP_COUNT, LICENSE_FIELD.STATUS]);
    return {
      appsCount: generatePayloadForLimits(
        licenseTerms[LICENSE_FIELD.APP_COUNT] !== LICENSE_LIMIT.UNLIMITED ? await this.appsCount() : 0,
        licenseTerms[LICENSE_FIELD.APP_COUNT],
        licenseTerms[LICENSE_FIELD.STATUS],
        LICENSE_LIMITS_LABEL.APPS
      ),
    };
  }

  async findAppWithIdOrSlug(slug: string): Promise<App> {
    let app: App;
    try {
      app = await this.find(slug);
    } catch (error) {
      /* means: UUID error. so the slug isn't not the id of the app */
      if (error?.code === `22P02`) {
        /* Search against slug */
        app = await this.findBySlug(slug);
      }
    }

    if (!app) throw new NotFoundException('App not found. Invalid app id');
    return app;
  }

  async validateVersionEnvironment(
    environmentName: string,
    environmentId: string,
    currentEnvIdOfVersion: string,
    organizationId: string
  ): Promise<AppEnvironment> {
    const environment: AppEnvironment = environmentId
      ? await this.appEnvironmentService.get(organizationId, environmentId)
      : await this.appEnvironmentService.getEnvironmentByName(environmentName, organizationId);
    if (!environment) {
      throw new NotFoundException("Couldn't found environment in the organization");
    }

    const currentEnvOfVersion: AppEnvironment = await this.appEnvironmentService.get(
      organizationId,
      currentEnvIdOfVersion
    );
    if (environment.priority <= currentEnvOfVersion.priority) {
      return environment;
    } else {
      throw new NotAcceptableException('Version is not promoted to the environment yet.');
    }
  }
  async findTooljetDbTables(appId: string): Promise<{ table_id: string }[]> {
    return await dbTransactionWrap(async (manager: EntityManager) => {
      const tooljetDbDataQueries = await manager
        .createQueryBuilder(DataQuery, 'data_queries')
        .innerJoin(DataSource, 'data_sources', 'data_queries.data_source_id = data_sources.id')
        .innerJoin(AppVersion, 'app_versions', 'app_versions.id = data_sources.app_version_id')
        .where('app_versions.app_id = :appId', { appId })
        .andWhere('data_sources.kind = :kind', { kind: 'tooljetdb' })
        .getMany();

      const uniqTableIds = [...new Set(tooljetDbDataQueries.map((dq) => dq.options['table_id']))];

      return uniqTableIds.map((table_id) => {
        return { table_id };
      });
    });
  }
}
