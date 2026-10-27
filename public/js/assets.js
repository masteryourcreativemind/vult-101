// AI NOTE: Original raster sprites are generated locally; no franchise sprites or external artwork are used.
const skins = ['#d5b296', '#a87b61', '#ead0ad', '#84624f', '#c48d71'];
const uniforms = { command: '#c5b275', research: '#84aaa5', marketing: '#c59472', design: '#b6a1b5', quality: '#c8877d', operations: '#c3a867', finance: '#a6b67e', knowledge: '#a7ada0' };
const cache = new Map();

export function spriteFor(worker, index = 0) {
    const key = `${worker.team}:${index % 5}`;
    if (cache.has(key)) return cache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 16;
    const context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    const pixel = (color, x, y, width, height) => { context.fillStyle = color; context.fillRect(x, y, width, height); };
    pixel('#101914', 2, 14, 9, 2);
    pixel('#434339', 3, 0, 6, 2);
    pixel('#434339', 2, 2, 8, 2);
    pixel(skins[index % skins.length], 3, 2, 6, 5);
    pixel('#27362b', 4, 4, 1, 1);
    pixel('#27362b', 7, 4, 1, 1);
    pixel(uniforms[worker.team] ?? '#9dab92', 2, 7, 8, 5);
    pixel('#d4cc99', 5, 8, 2, 2);
    pixel(skins[index % skins.length], 1, 8, 2, 4);
    pixel(skins[index % skins.length], 9, 8, 2, 4);
    pixel('#596454', 3, 12, 3, 2);
    pixel('#596454', 7, 12, 2, 2);
    pixel('#28362c', 2, 14, 4, 1);
    pixel('#28362c', 7, 14, 3, 1);
    cache.set(key, canvas);
    return canvas;
}
