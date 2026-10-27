// AI NOTE: Integer-tile raster rendering uses only authoritative worker positions; clicks select, never move.
import { spriteFor } from './assets.js';

export function createRenderer(canvas, viewport, onSelect) {
    const context = canvas.getContext('2d');
    let state;
    let selected;
    let tile = 12;
    function draw() {
        if (!state) return;
        const world = state.world;
        tile = Math.max(4, Math.min(20, Math.floor((viewport.clientWidth - 2) / world.width)));
        canvas.width = world.width * tile;
        canvas.height = world.height * tile;
        context.imageSmoothingEnabled = false;
        const rectangle = (color, x, y, width, height) => { context.fillStyle = color; context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height)); };
        rectangle('#17241c', 0, 0, canvas.width, canvas.height);
        for (let y = 0; y < world.height; y += 1) {
            for (let x = 0; x < world.width; x += 1) {
                rectangle((x + y) % 2 ? '#1d2b21' : '#202e23', x * tile, y * tile, tile - 1, tile - 1);
                if (x % 12 === 0 && y % 11 === 0) rectangle('#46523d', x * tile + 1, y * tile + 1, 2, 1);
            }
        }
        for (const room of world.facilities) {
            const roomX = room.x * tile;
            const roomY = room.y * tile;
            rectangle('#0d1711', roomX + 2, roomY + 3, room.w * tile, room.h * tile);
            rectangle('#64705a', roomX, roomY, room.w * tile, room.h * tile);
            rectangle('#394a39', roomX + tile, roomY + tile, (room.w - 2) * tile, (room.h - 2) * tile);
            for (let row = 1; row < room.h - 1; row += 1) {
                for (let column = 1; column < room.w - 1; column += 1) rectangle((row + column) % 2 ? '#3b4b39' : '#3f4e3b', roomX + column * tile, roomY + row * tile, tile - 1, tile - 1);
            }
            rectangle('#8a9476', roomX, roomY, room.w * tile, Math.max(1, tile / 4));
            rectangle('#233629', roomX, roomY + (room.h - 1) * tile, room.w * tile, tile);
            rectangle('#25392a', roomX + tile * 12, roomY, tile, tile);
            rectangle('#7b8463', roomX + tile * 12, roomY + (room.h - 1) * tile, tile, tile);
            rectangle(room.color, roomX + tile, roomY + tile, Math.max(1, tile / 4), Math.max(2, tile / 2));
            context.font = `${Math.max(5, Math.floor(tile * .65))}px Plex, monospace`;
            context.fillStyle = '#d5dcc0';
            context.textBaseline = 'top';
            context.fillText(room.name, roomX + tile * 1.7, roomY + tile * 1.05, (room.w - 3) * tile);
            for (const station of world.stations.filter(item => item.facility === room.id && item.kind === 'desk')) {
                const deskX = station.x * tile;
                const deskY = (station.y - 1) * tile;
                rectangle('#213024', deskX - tile / 2 + 1, deskY + 3, tile * 2, tile * 1.3);
                rectangle('#8b8461', deskX - tile / 2, deskY, tile * 2, tile);
                rectangle('#afab7e', deskX - tile / 2, deskY, tile * 2, Math.max(1, tile / 5));
                if (room.id === 'kitchen_break_room') {
                    rectangle('#d7d1aa', deskX + 2, deskY + 2, Math.max(2, tile / 3), Math.max(2, tile / 3));
                    rectangle('#705e42', deskX + 3, deskY + 3, 1, 1);
                } else {
                    rectangle('#17291c', deskX, deskY - tile / 2, tile, tile * .75);
                    rectangle('#8ea67b', deskX + 1, deskY - tile / 2 + 1, tile - 2, Math.max(1, tile / 3));
                    rectangle('#d4b774', deskX + tile, deskY + 2, Math.max(1, tile / 4), Math.max(1, tile / 3));
                }
                rectangle('#27372a', deskX, (station.y + 1) * tile, tile, Math.max(1, tile / 3));
            }
            if (room.seats < 3) {
                for (let column = 0; column < 4; column += 1) {
                    const shelfX = roomX + (room.w - 7 + column) * tile;
                    rectangle('#6d7656', shelfX, roomY + tile * 3, tile - 1, tile * 3);
                    rectangle(column % 2 ? room.color : '#9eac82', shelfX + 1, roomY + tile * 3 + 1, Math.max(1, tile / 3), tile * 2 - 2);
                }
            }
            rectangle('#263c27', roomX + (room.w - 3) * tile, roomY + (room.h - 3) * tile, tile, tile);
            rectangle('#8b9970', roomX + (room.w - 3) * tile + 1, roomY + (room.h - 3) * tile - tile / 2, tile - 2, tile);
            if (selected?.type === 'room' && selected.id === room.id) {
                context.strokeStyle = '#dfb971'; context.lineWidth = 2;
                context.strokeRect(roomX + 1, roomY + 1, room.w * tile - 2, room.h * tile - 2);
            }
        }
        [...world.workers].sort((first, second) => first.y - second.y).forEach(worker => {
            const originalIndex = world.workers.findIndex(item => item.id === worker.id);
            const sprite = spriteFor(worker, originalIndex);
            const scale = Math.max(1, Math.floor(tile / 8));
            const width = 12 * scale;
            const height = 16 * scale;
            const spriteX = Math.round((worker.x + .5) * tile - width / 2);
            const spriteY = Math.round((worker.y + 1) * tile - height);
            context.drawImage(sprite, spriteX, spriteY, width, height);
            if (selected?.type === 'worker' && selected.id === worker.id) {
                context.strokeStyle = '#e3d587'; context.lineWidth = 1;
                context.strokeRect(spriteX - 2, spriteY - 2, width + 4, height + 4);
            }
        });
    }
    canvas.addEventListener('click', event => {
        if (!state) return;
        const bounds = canvas.getBoundingClientRect();
        const x = (event.clientX - bounds.left) * canvas.width / bounds.width / tile;
        const y = (event.clientY - bounds.top) * canvas.height / bounds.height / tile;
        const worker = state.world.workers.find(item => Math.abs(item.x + .5 - x) < .9 && Math.abs(item.y + .5 - y) < 1.2);
        if (worker) selected = { type: 'worker', id: worker.id };
        else {
            const room = state.world.facilities.find(item => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h);
            selected = room ? { type: 'room', id: room.id } : null;
        }
        onSelect(selected);
        draw();
    });
    const observer = new ResizeObserver(draw);
    observer.observe(viewport);
    document.fonts.ready.then(draw);
    return { update(next) { state = next; draw(); }, select(value) { selected = value; draw(); } };
}
