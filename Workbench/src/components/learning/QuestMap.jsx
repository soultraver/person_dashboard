import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";

const NODE_RADIUS = 22;

function nodeClass(level) {
  if (level.effectiveStatus === "mastered" && level.verifiedBy === "self-assessed") return "quest-node quest-node--self";
  return `quest-node quest-node--${level.effectiveStatus}`;
}

export function QuestMap({ levels, onSelect }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [positions, setPositions] = useState([]);

  const nodes = useMemo(
    () => levels.map((level) => ({ id: level.slug, level })),
    [levels],
  );
  const links = useMemo(
    () => levels.flatMap((level) => level.dependsOn.map((source) => ({ source, target: level.slug }))),
    [levels],
  );

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const simulation = forceSimulation(nodes)
      .force("link", forceLink(links).id((node) => node.id).distance(140))
      .force("charge", forceManyBody().strength(-260))
      .force("collide", forceCollide(NODE_RADIUS + 26))
      .force("center", forceCenter(size.width / 2, size.height / 2));
    simulation.on("tick", () => {
      setPositions(nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, level: node.level })));
    });
    return () => simulation.stop();
  }, [nodes, links, size]);

  const positionById = new Map(positions.map((entry) => [entry.id, entry]));

  return (
    <div ref={containerRef} className="quest-map" role="img" aria-label="闯关地图">
      <svg width={size.width} height={size.height}>
        {links.map((link, index) => {
          const source = positionById.get(typeof link.source === "object" ? link.source.id : link.source);
          const target = positionById.get(typeof link.target === "object" ? link.target.id : link.target);
          if (!source || !target) return null;
          const open = source.level.effectiveStatus === "mastered";
          return (
            <line
              key={index}
              className={open ? "quest-edge quest-edge--open" : "quest-edge"}
              x1={source.x} y1={source.y} x2={target.x} y2={target.y}
            />
          );
        })}
        {positions.map((entry) => (
          <g
            key={entry.id}
            className={nodeClass(entry.level)}
            transform={`translate(${entry.x},${entry.y})`}
            onClick={() => onSelect(entry.level)}
          >
            <circle r={NODE_RADIUS} />
            <title>{`${entry.level.title} · ${entry.level.effectiveStatus} · 掌握度 ${entry.level.mastery}`}</title>
            <text y={NODE_RADIUS + 14} textAnchor="middle">{entry.level.title}</text>
            {entry.level.effectiveStatus === "mastered" ? (
              <text y={4} textAnchor="middle" fill="#fff">{entry.level.mastery}</text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
