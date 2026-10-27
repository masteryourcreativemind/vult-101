// AI NOTE: Four-direction A* uses a fresh library grid on every search; walls are never crossed.
import PathFinding from 'pathfinding';
import { isWalkable, mapSize } from './world.js';

export function findPath(start, end, { width = mapSize.width, height = mapSize.height, walkable = isWalkable } = {}) {
    const inBounds = tile => tile && Number.isInteger(tile.x) && Number.isInteger(tile.y) && tile.x >= 0 && tile.y >= 0 && tile.x < width && tile.y < height;
    if (!inBounds(start) || !inBounds(end) || !walkable(start) || !walkable(end)) return [];
    const matrix = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => walkable({ x, y }) ? 0 : 1));
    const finder = new PathFinding.AStarFinder({ allowDiagonal: false });
    return finder.findPath(start.x, start.y, end.x, end.y, new PathFinding.Grid(matrix)).slice(1).map(([x, y]) => ({ x, y }));
}
