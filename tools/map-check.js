// AI NOTE: Validate the same room geometry and A* routes that the trusted runtime actually uses.
import assert from 'node:assert/strict';
import { classes, facilities, stations, mapSize, facilityAt, isWalkable } from '../server/sim/world.js';
import { findPath } from '../server/sim/pathfinding.js';

assert.equal(new Set(facilities.map(room => room.id)).size, facilities.length, 'Facility IDs must be unique.');
assert.equal(new Set(classes.map(definition => definition.id)).size, classes.length, 'Class IDs must be unique.');
assert.equal(new Set(stations.map(station => station.id)).size, stations.length, 'Station IDs must be unique.');
assert.equal(new Set(stations.map(station => `${station.x},${station.y}`)).size, stations.length, 'Stations cannot overlap.');
assert.ok(stations.length > 0, 'The vault needs reachable workstations.');

for (const room of facilities) {
    assert.ok([room.x, room.y, room.w, room.h, room.seats].every(Number.isSafeInteger), room.id);
    assert.ok(room.x >= 1 && room.y >= 1 && room.x + room.w < mapSize.width && room.y + room.h < mapSize.height, `${room.id} must fit within the map.`);
    assert.ok(room.seats > 0 && room.w > 13 && room.h > 7, `${room.id} must fit its entrances and stations.`);
    for (const other of facilities.filter(item => item.id !== room.id)) {
        assert.ok(room.x + room.w <= other.x || other.x + other.w <= room.x || room.y + room.h <= other.y || other.y + other.h <= room.y, `${room.id} overlaps ${other.id}.`);
    }
    const homeCount = classes.filter(definition => definition.home === room.id).reduce((count, definition) => count + definition.names.length, 0);
    assert.ok(homeCount <= room.seats, `${room.id} needs enough home workstations.`);
}

for (const station of stations) {
    assert.equal(facilityAt(station), station.facility, station.id);
    assert.equal(isWalkable(station), true, station.id);
    if (station.id === stations[0].id) continue;
    const path = findPath(stations[0], station);
    assert.ok(path.length > 0, `${station.id} is unreachable.`);
    let previous = stations[0];
    for (const position of path) {
        assert.equal(isWalkable(position), true, station.id);
        assert.equal(Math.abs(previous.x - position.x) + Math.abs(previous.y - position.y), 1, station.id);
        previous = position;
    }
}

for (const definition of classes) assert.ok(facilities.some(room => room.id === definition.home), `${definition.id} needs a home facility.`);
const workers = classes.reduce((count, definition) => count + definition.names.length, 0);
assert.equal(workers, 16, 'The commissioned roster must remain fixed at 16 bodies.');
assert.equal(classes.find(definition => definition.id === 'researcher')?.names.length, 5, 'The research team needs five independent bodies.');
assert.ok(stations.some(station => station.facility === 'kitchen_break_room'), 'A reachable recovery kitchen is required.');
console.log(`Map OK: ${mapSize.width} x ${mapSize.height}, ${facilities.length} rooms, ${stations.length} reachable stations, ${workers} workers.`);
