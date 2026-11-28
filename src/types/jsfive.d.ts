/** The small part of jsfive (a pure-JS HDF5 reader, public domain) that lib/server/glm.ts uses. */
declare module "jsfive" {
  export class Dataset {
    readonly value: ArrayLike<number>;
    readonly shape: number[];
    readonly attrs: Record<string, unknown>;
  }
  export class File {
    constructor(buffer: ArrayBuffer, filename?: string);
    readonly keys: string[];
    get(path: string): Dataset | undefined;
  }
}
