import { execSync } from 'child_process';
import appRootDir from 'app-root-dir';
import { resolve as resolvePath } from 'path';
import { readFileSync } from 'fs';

export function removeEmpty(x) {
  return x.filter(y => y != null);
}

export function ifElse(condition) {
  return function ifElseResolver(then, or) {
    const execIfFuc = x => typeof x === 'function' ? x() : x;
    return condition ? execIfFuc(then) : or;
  };
}

export function getPackageJson() {
  return JSON.parse(readFileSync(resolvePath(appRootDir.get(), './package.json'), 'utf-8'));
}

export function exec(command: string) {
  execSync(command, { stdio: 'inherit', cwd: appRootDir.get() });
}
