import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type GameTemplate, loadTemplates } from '@swifty/templates';
import { AppException } from '../../common/app.exception';

@Injectable()
export class TemplatesService implements OnModuleInit {
  private templates = new Map<string, GameTemplate>();

  async onModuleInit(): Promise<void> {
    for (const template of await loadTemplates()) {
      this.templates.set(template.id, template);
    }
  }

  list(): GameTemplate[] {
    return [...this.templates.values()];
  }

  findById(id: string): GameTemplate {
    const template = this.templates.get(id);
    if (!template) {
      throw new AppException(404, 'templates.not_found', 'Game template not found');
    }
    return template;
  }
}
