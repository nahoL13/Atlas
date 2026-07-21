import type { AtlasPlatform } from '@atlas/contracts';
import type { OutputGateway } from '../gateway/output-gateway.js';

export function runSkillsList(atlas: AtlasPlatform, output: OutputGateway): void {
  const skills = atlas.skills.list();
  if (skills.length === 0) {
    output.write('Nenhuma Skill catalogada.\n');
    return;
  }
  const lines = skills.map(
    (skill) =>
      `[${skill.id}] ${skill.name} (${skill.scope}, v${skill.version}, ` +
      `${skill.active ? 'ativa' : 'inativa'}) — ${skill.description}`,
  );
  output.write(`${lines.join('\n')}\n`);
}

export async function runSkillsBuild(
  atlas: AtlasPlatform,
  capability: string,
  output: OutputGateway,
): Promise<void> {
  const result = await atlas.skillBuilder.build({ capability });
  if (result.ok && result.skill !== undefined) {
    const skill = result.skill;
    output.write(
      [
        `Skill construída [${skill.id}] ${skill.name} (${skill.scope}, v${skill.version})`,
        skill.description,
        `Tools: ${skill.toolIds.length > 0 ? skill.toolIds.join(', ') : '(nenhuma)'}`,
        `Instruções: ${skill.instructions}`,
        '',
      ].join('\n'),
    );
    return;
  }
  const issues = result.issues ?? [];
  output.write(
    ['Não foi possível construir a Skill:', ...issues.map((issue) => `  - ${issue}`), ''].join(
      '\n',
    ),
  );
}
