// AI NOTE: Bodies and workstation occupancy are authoritative server state, never browser commands.
import { readFileSync } from 'node:fs';

export const facilities = JSON.parse(readFileSync(new URL('../../config/locked/facilities.json', import.meta.url), 'utf8')).facilities;
export const classes = JSON.parse(readFileSync(new URL('../../config/locked/classes.json', import.meta.url), 'utf8')).classes;
export const mapSize = { width: 78, height: 57, tileSize: 16 };

export function stationsFor(facility) {
    const stations = Array.from({ length: facility.seats }, (_, index) => ({
        id: `${facility.id}:desk:${index}`, facility: facility.id, kind: 'desk',
        x: facility.x + 3 + index * 4, y: facility.y + 4,
    }));
    if (facility.id === 'comms_lab' || facility.id === 'diner') {
        for (let index = 0; index < facility.seats; index += 1) {
            stations.push({ id: `${facility.id}:review:${index}`, facility: facility.id, kind: 'review', x: facility.x + 3 + index * 4, y: facility.y + 6 });
        }
    }
    return stations;
}

export const stations = facilities.flatMap(stationsFor);

export function facilityAt({ x, y }) {
    return facilities.find(room => x > room.x && x < room.x + room.w - 1 && y > room.y && y < room.y + room.h - 1)?.id ?? null;
}

export function isWalkable({ x, y }) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1 || x >= mapSize.width - 1 || y >= mapSize.height - 1) return false;
    const room = facilities.find(item => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h);
    if (!room) return true;
    if (x === room.x || x === room.x + room.w - 1) return false;
    if (y === room.y || y === room.y + room.h - 1) return x === room.x + 12;
    return true;
}

export function createWorld(store, { clock = () => new Date() } = {}) {
    const { database } = store;
    store.transaction(() => {
        for (const definition of classes) {
            const seats = stations.filter(station => station.facility === definition.home && station.kind === 'desk');
            definition.names.forEach((name, index) => {
                const seat = seats[index];
                database.prepare('INSERT OR IGNORE INTO workers (id, name, class, team, x, y, progress_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    .run(`${definition.id}-${index + 1}`, name, definition.id, definition.team, seat.x, seat.y, clock().toISOString());
            });
        }
    });
    const getWorker = id => {
        const worker = database.prepare('SELECT * FROM workers WHERE id = ?').get(id);
        return worker ? { ...worker, path: JSON.parse(worker.path) } : null;
    };
    return {
        getWorker,
        facilityAt,
        stationAt(worker) { return stations.find(station => station.x === worker.x && station.y === worker.y); },
        reserveStation(worker, task) {
            const station = this.stationAt(worker);
            if (!station) throw new Error('Worker is not at an authorized workstation.');
            database.prepare('INSERT INTO station_locks (station_id, worker_id, task_id, lease_token) VALUES (?, ?, ?, ?)')
                .run(station.id, worker.id, task.id, task.lease_token);
            return station;
        },
        releaseStation(workerId, token) {
            database.prepare('DELETE FROM station_locks WHERE worker_id = ? AND lease_token = ?').run(workerId, token);
        },
        moveStep(id, destination) {
            return store.transaction(() => {
                const worker = getWorker(id);
                if (!worker || !isWalkable(destination) || Math.abs(worker.x - destination.x) + Math.abs(worker.y - destination.y) !== 1) throw new Error('Invalid movement step.');
                if (database.prepare('SELECT 1 FROM station_locks WHERE worker_id = ?').get(id)) throw new Error('Workstation is reserved by an in-flight action.');
                database.prepare('UPDATE workers SET x = ?, y = ? WHERE id = ?').run(destination.x, destination.y, id);
                return getWorker(id);
            });
        },
        serialize() {
            return { ...mapSize, facilities, stations, workers: database.prepare('SELECT id FROM workers ORDER BY id').all().map(worker => getWorker(worker.id)) };
        },
    };
}
