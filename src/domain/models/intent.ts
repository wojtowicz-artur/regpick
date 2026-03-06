export type FlagValue = string | boolean;

export type CliArgs = {
  flags: Record<string, FlagValue>;
  positionals: string[];
};

export type CommandContext = {
  cwd: string;
  args: CliArgs;
};

export type AddFlags = {
  cwd: string;
  yes?: boolean;
  overwrite?: boolean;
  components?: string[];
  [key: string]: FlagValue | undefined | string[];
};

export type AddIntent = {
  source: string;
  flags: AddFlags;
};

export type UpdateFlags = {
  cwd: string;
  yes?: boolean;
  all?: boolean;
  [key: string]: FlagValue | undefined;
};

export type UpdateIntent = {
  flags: UpdateFlags;
};

export type InitFlags = {
  cwd: string;
  yes?: boolean;
  force?: boolean;
  [key: string]: FlagValue | undefined;
};

export type InitIntent = {
  flags: InitFlags;
};

export type ListIntent = {
  flags: { cwd: string };
};

export type PackIntent = {
  source: string;
  output: string;
  flags: { cwd: string };
};
