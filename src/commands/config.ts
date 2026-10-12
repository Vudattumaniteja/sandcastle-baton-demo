import pc from 'picocolors';
import { ConfigStore } from '#packages/state';
import type { ConfigKey } from '#packages/state';

export function configGetCommand(
  key: string,
  options: { json?: boolean } = {},
  service?: ConfigStore | any
): void {
  const config = service ?? new ConfigStore();
  const value = config.get(key as ConfigKey);

  if (options.json) {
    console.log(JSON.stringify({ key, value }, null, 2));
  } else {
    console.log(`${pc.bold(key)}: ${value !== undefined ? pc.cyan(String(value)) : pc.gray('(not set)')}`);
  }
}

export function configSetCommand(
  key: string,
  value: string,
  options: { global?: boolean } = {},
  service?: ConfigStore | any
): void {
  const config = service ?? new ConfigStore();
  let parsedValue: any = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value)) && value.trim() !== '') parsedValue = Number(value);

  config.set(key as ConfigKey, parsedValue, options.global ?? false);
  const scope = options.global ? 'global' : 'local';
  console.log(pc.green(`✔ Successfully set ${pc.bold(key)} = ${pc.cyan(String(value))} (${scope} config)`));
}

export function configListCommand(
  options: { json?: boolean } = {},
  service?: ConfigStore | any
): void {
  const config = service ?? new ConfigStore();
  const list = config.list();

  if (options.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }

  console.log(`\n${pc.bold(pc.cyan('Sandcastle Configuration (3-Tier Resolution)'))}`);
  console.log(pc.gray('===============================================\n'));

  console.log(pc.bold('Resolved Effective Config:'));
  for (const [k, v] of Object.entries(list.resolved)) {
    console.log(`  ${pc.bold(k)}: ${pc.cyan(String(v))}`);
  }

  console.log(`\n${pc.dim('Local Overrides (.sandcastle/config.json):')}`);
  for (const [k, v] of Object.entries(list.local)) {
    console.log(`  ${pc.dim(k)}: ${v}`);
  }

  console.log(`\n${pc.dim('Global Defaults (~/.sandcastle/config.json):')}`);
  for (const [k, v] of Object.entries(list.global)) {
    console.log(`  ${pc.dim(k)}: ${v}`);
  }
  console.log('');
}
