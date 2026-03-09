import { useEffect, useRef, useCallback, useState } from "react";
import { useStore } from "@/lib/store";
import { buildGraph, type GraphNode } from "@/lib/wiki-links";
import { FileText } from "lucide-react";

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isKanban: boolean;
}

export function KnowledgeGraph() {
  const { notes, selectNote, setActiveView } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<{ source: string; target: string }[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const dragRef = useRef<{ nodeId: string | null; panning: boolean; lastX: number; lastY: number }>({
    nodeId: null,
    panning: false,
    lastX: 0,
    lastY: 0,
  });

  // Build graph data
  useEffect(() => {
    const { nodes, edges } = buildGraph(notes);
    const w = canvasRef.current?.width || 800;
    const h = canvasRef.current?.height || 600;

    nodesRef.current = nodes.map((n, i) => ({
      ...n,
      x: w / 2 + (Math.random() - 0.5) * 300,
      y: h / 2 + (Math.random() - 0.5) * 300,
      vx: 0,
      vy: 0,
    }));
    edgesRef.current = edges;
  }, [notes]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    return {
      x: (sx - offsetRef.current.x) / scaleRef.current,
      y: (sy - offsetRef.current.y) / scaleRef.current,
    };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number) => {
    for (const node of nodesRef.current) {
      const r = 8 + node.linkCount * 3;
      const dx = node.x - wx;
      const dy = node.y - wy;
      if (dx * dx + dy * dy < r * r) return node;
    }
    return null;
  }, []);

  // Force simulation + render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const w = canvas.width;
      const h = canvas.height;

      // Forces
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 800 / (dist * dist);
          nodes[i].vx -= (dx / dist) * force;
          nodes[i].vy -= (dy / dist) * force;
          nodes[j].vx += (dx / dist) * force;
          nodes[j].vy += (dy / dist) * force;
        }
      }

      // Spring forces for edges
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * 0.04;
        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
        t.vx -= (dx / dist) * force;
        t.vy -= (dy / dist) * force;
      }

      // Center gravity
      for (const node of nodes) {
        node.vx += (w / 2 - node.x) * 0.001;
        node.vy += (h / 2 - node.y) * 0.001;
      }

      // Apply velocity
      for (const node of nodes) {
        if (dragRef.current.nodeId === node.id) continue;
        node.vx *= 0.85;
        node.vy *= 0.85;
        node.x += node.vx;
        node.y += node.vy;
      }

      // Render
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(offsetRef.current.x, offsetRef.current.y);
      ctx.scale(scaleRef.current, scaleRef.current);

      const isDark = document.documentElement.classList.contains("dark");
      const edgeColor = isDark ? "rgba(148,163,184,0.2)" : "rgba(100,116,139,0.15)";
      const edgeHighlight = isDark ? "rgba(148,163,184,0.6)" : "rgba(100,116,139,0.5)";
      const noteColor = isDark ? "hsl(210,40%,70%)" : "hsl(222,47%,25%)";
      const noteHighlight = isDark ? "hsl(210,60%,80%)" : "hsl(222,60%,40%)";
      const kanbanColor = isDark ? "hsl(35,70%,60%)" : "hsl(35,60%,40%)";
      const kanbanHighlight = isDark ? "hsl(35,80%,70%)" : "hsl(35,70%,50%)";
      const textColor = isDark ? "hsl(210,40%,90%)" : "hsl(222,84%,10%)";

      // Draw edges
      for (const edge of edges) {
        const s = nodeMap.get(edge.source);
        const t = nodeMap.get(edge.target);
        if (!s || !t) continue;
        const isHighlighted =
          hoveredId === edge.source || hoveredId === edge.target;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = isHighlighted ? edgeHighlight : edgeColor;
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        const r = 8 + node.linkCount * 3;
        const isHovered = hoveredId === node.id;
        const isConnected =
          hoveredId &&
          edges.some(
            (e) =>
              (e.source === hoveredId && e.target === node.id) ||
              (e.target === hoveredId && e.source === node.id)
          );

        const baseColor = node.isKanban ? kanbanColor : noteColor;
        const highlightColor = node.isKanban ? kanbanHighlight : noteHighlight;

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          isHovered || isConnected ? highlightColor : baseColor;
        ctx.globalAlpha = hoveredId && !isHovered && !isConnected ? 0.3 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label
        ctx.font = `${isHovered ? "bold " : ""}11px system-ui, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.globalAlpha = hoveredId && !isHovered && !isConnected ? 0.3 : 1;
        ctx.textAlign = "center";
        ctx.fillText(node.title, node.x, node.y + r + 14);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [hoveredId, notes]);

  // Mouse interactions
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x, y } = screenToWorld(sx, sy);

      if (dragRef.current.nodeId) {
        const node = nodesRef.current.find((n) => n.id === dragRef.current.nodeId);
        if (node) {
          node.x = x;
          node.y = y;
          node.vx = 0;
          node.vy = 0;
        }
        return;
      }

      if (dragRef.current.panning) {
        offsetRef.current.x += e.clientX - dragRef.current.lastX;
        offsetRef.current.y += e.clientY - dragRef.current.lastY;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
        return;
      }

      const node = findNodeAt(x, y);
      setHoveredId(node?.id || null);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = node ? "pointer" : "grab";
      }
    },
    [screenToWorld, findNodeAt]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const node = findNodeAt(x, y);
      if (node) {
        dragRef.current.nodeId = node.id;
      } else {
        dragRef.current.panning = true;
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
      }
    },
    [screenToWorld, findNodeAt]
  );

  const handleMouseUp = useCallback(() => {
    dragRef.current.nodeId = null;
    dragRef.current.panning = false;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const { x, y } = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const node = findNodeAt(x, y);
      if (node) {
        selectNote(node.id);
        setActiveView("notebook");
      }
    },
    [screenToWorld, findNodeAt, selectNote, setActiveView]
  );

  const handleZoom = useCallback((direction: "in" | "out") => {
    const delta = direction === "in" ? 1.2 : 0.8;
    const newScale = Math.max(0.2, Math.min(3, scaleRef.current * delta));
    const canvas = canvasRef.current;
    if (canvas) {
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      offsetRef.current.x = cx - ((cx - offsetRef.current.x) / scaleRef.current) * newScale;
      offsetRef.current.y = cy - ((cy - offsetRef.current.y) / scaleRef.current) * newScale;
    }
    scaleRef.current = newScale;
  }, []);

  if (notes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No notes yet</p>
          <p className="text-sm mt-1">Create notes with [[wiki-links]] to see your knowledge graph</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button onClick={() => handleZoom("in")} className="h-7 w-7 rounded-md bg-card/80 backdrop-blur border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm font-bold">+</button>
        <button onClick={() => handleZoom("out")} className="h-7 w-7 rounded-md bg-card/80 backdrop-blur border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors text-sm font-bold">−</button>
        <div className="text-xs text-muted-foreground bg-card/80 backdrop-blur px-2 py-1 rounded-md border border-border flex items-center gap-2 ml-1">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(210,40%,70%)" }} /> Notes</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: "hsl(35,70%,60%)" }} /> Tasks</span>
        </div>
      </div>
    </div>
  );
}
