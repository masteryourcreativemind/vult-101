// AI NOTE: Public assets and narrowly mapped vendored assets are the only readable HTTP files.
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { projectRoot } from '../config.js';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const publicRoot = resolve(projectRoot, 'public');
const fonts = {
    'barlow-condensed-latin-600-normal.woff2': '@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2',
    'ibm-plex-mono-latin-400-normal.woff2': '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
};

export async function serveStatic(pathname, request, response) {
    let target;
    let root = publicRoot;
    const icon = /^\/vendor\/icons\/([a-z0-9-]+)\.svg$/.exec(pathname);
    const font = /^\/vendor\/fonts\/([a-z0-9-]+\.woff2)$/.exec(pathname);
    if (icon) {
        root = resolve(projectRoot, 'node_modules/lucide-static/icons');
        target = resolve(root, `${icon[1]}.svg`);
    } else if (font && fonts[font[1]]) {
        root = resolve(projectRoot, 'node_modules/@fontsource');
        target = resolve(projectRoot, 'node_modules', fonts[font[1]]);
    } else {
        target = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
    }
    try {
        const actual = await realpath(target);
        if (!actual.startsWith(`${root}${sep}`) || !mime[extname(actual)] || pathname.split('/').some(part => part.startsWith('.'))) return false;
        const content = await readFile(actual);
        response.writeHead(200, { 'Content-Type': mime[extname(actual)], 'Content-Length': content.length, 'Cache-Control': 'no-cache' });
        response.end(request.method === 'HEAD' ? undefined : content);
        return true;
    } catch (error) {
        if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code)) return false;
        throw error;
    }
}
