export type RegistryFile = {
  path?: string;
  url?: string;
  content?: string;
  type?: string;
};

export type RegistryItem = {
  name: string;
  type: string;
  dependencies?: string[];
  devDependencies?: string[];
  registryDependencies?: string[];
  files: RegistryFile[];
  sourceMeta: {
    originalSource?: string;
    [key: string]: unknown;
  };
};

export type Registry = {
  items: RegistryItem[];
  source: string;
};
