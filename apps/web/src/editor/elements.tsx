import React, { memo, useEffect, useRef, useState } from 'react';
import type { RichText, SlideElement, Theme } from '@jkinco/scene-schema';
import { textToPlain } from '@jkinco/scene-schema';
import { buildEChartsOption } from '@jkinco/chart-engine';

// ---------------------------------------------------------------------------
// Shared text rendering
// ---------------------------------------------------------------------------

export function RichTextView({
  text,
  style,
  width,
  height,
  verticalAlign,
}: {
  text: RichText | undefined;
  style: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    align?: string;
    lineSpacing?: number;
  };
  width: number;
  height: number;
  verticalAlign?: string;
}) {
  const baseFontSize = style.fontSize ?? 18;
  const baseColor = style.color ?? '#1E293B';
  const lineHeight = style.lineSpacing ?? 1.4;
  const justifyContent =
    verticalAlign === 'middle' ? 'center' : verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
  const textAlign = (style.align ?? 'left') as React.CSSProperties['textAlign'];
  return (
    <div
      className="no-select flex flex-col overflow-hidden"
      style={{ width, height, justifyContent, textAlign, lineHeight }}
    >
      {text?.paragraphs.map((p, pi) => {
        const pAlign = p.align ?? style.align ?? 'left';
        return (
          <p
            key={pi}
            style={{
              margin: 0,
              paddingLeft: p.bullet ? 20 : (p.indent ?? 0) * 18,
              textIndent: p.bullet ? -20 : 0,
              textAlign: pAlign as React.CSSProperties['textAlign'],
              paddingTop: p.spacingBefore ?? 0,
            }}
          >
            {p.bullet && (
              <span style={{ paddingRight: 6 }}>{p.bulletChar ?? '•'}</span>
            )}
            {p.runs.map((r, ri) => (
              <span
                key={ri}
                style={{
                  fontFamily: r.fontFamily ?? style.fontFamily,
                  fontSize: r.fontSize ?? baseFontSize,
                  color: r.color ?? baseColor,
                  fontWeight: r.bold ?? style.bold ? 700 : 400,
                  fontStyle: r.italic ?? style.italic ? 'italic' : 'normal',
                  textDecoration: r.underline ?? style.underline ? 'underline' : r.strike ? 'line-through' : 'none',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'break-word',
                }}
              >
                {r.text}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shape SVG paths (logical coordinate space of the element box)
// ---------------------------------------------------------------------------

export function shapePath(kind: string, w: number, h: number, radius = 0): string {
  const r = Math.min(radius, w / 2, h / 2);
  switch (kind) {
    case 'rect':
      return `M0 0 H${w} V${h} H0 Z`;
    case 'roundRect':
      return `M${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${h - r} Q${w} ${h} ${w - r} ${h} H${r} Q0 ${h} 0 ${h - r} V${r} Q0 0 ${r} 0 Z`;
    case 'pill': {
      const pr = h / 2;
      return `M${pr} 0 H${w - pr} Q${w} 0 ${w} ${pr} V${pr} Q${w} ${h} ${w - pr} ${h} H${pr} Q0 ${h} 0 ${pr} V${pr} Q0 0 ${pr} 0 Z`;
    }
    case 'ellipse':
      return `M${w / 2} 0 A${w / 2} ${h / 2} 0 1 0 ${w / 2} ${h} A${w / 2} ${h / 2} 0 1 0 ${w / 2} 0 Z`;
    case 'line':
      return `M0 ${h / 2} L${w} ${h / 2}`;
    case 'triangle':
      return `M${w / 2} 0 L${w} ${h} L0 ${h} Z`;
    case 'rightTriangle':
      return `M0 0 L${w} ${h} L0 ${h} Z`;
    case 'diamond':
      return `M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`;
    case 'pentagon':
      return `M${w / 2} 0 L${w} ${h * 0.38} L${w * 0.82} ${h} L${w * 0.18} ${h} L0 ${h * 0.38} Z`;
    case 'hexagon':
      return `M${w * 0.25} 0 L${w * 0.75} 0 L${w} ${h / 2} L${w * 0.75} ${h} L${w * 0.25} ${h} L0 ${h / 2} Z`;
    case 'chevron':
      return `M${w * 0.2} 0 L${w} 0 L${w * 0.8} ${h / 2} L${w} ${h} L${w * 0.2} ${h} L0 ${h / 2} Z`;
    case 'arrowRight':
      return `M0 ${h * 0.25} L${w * 0.7} ${h * 0.25} L${w * 0.7} 0 L${w} ${h / 2} L${w * 0.7} ${h} L${w * 0.7} ${h * 0.75} L0 ${h * 0.75} Z`;
    case 'arrowLeft':
      return `M${w} ${h * 0.25} L${w * 0.3} ${h * 0.25} L${w * 0.3} 0 L0 ${h / 2} L${w * 0.3} ${h} L${w * 0.3} ${h * 0.75} L${w} ${h * 0.75} Z`;
    case 'arrowUp':
      return `M${w * 0.25} ${h} L${w * 0.25} ${h * 0.3} L0 ${h * 0.3} L${w / 2} 0 L${w} ${h * 0.3} L${w * 0.75} ${h * 0.3} L${w * 0.75} ${h} Z`;
    case 'arrowDown':
      return `M${w * 0.25} 0 L${w * 0.25} ${h * 0.7} L0 ${h * 0.7} L${w / 2} ${h} L${w} ${h * 0.7} L${w * 0.75} ${h * 0.7} L${w * 0.75} 0 Z`;
    case 'star': {
      const cx = w / 2;
      const cy = h / 2;
      const outer = Math.min(w, h) / 2;
      const inner = outer * 0.45;
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${(cx + rad * Math.cos(angle)).toFixed(2)},${(cy + rad * Math.sin(angle)).toFixed(2)}`);
      }
      return `M${pts.join(' L')} Z`;
    }
    case 'parallelogram':
      return `M${w * 0.2} 0 L${w} 0 L${w * 0.8} ${h} L0 ${h} Z`;
    case 'trapezoid':
      return `M${w * 0.18} 0 L${w * 0.82} 0 L${w} ${h} L0 ${h} Z`;
    default:
      return `M0 0 H${w} V${h} H0 Z`;
  }
}

function connectorPath(el: Extract<SlideElement, { type: 'connector' }>): string {
  const x1 = el.start.x - el.x;
  const y1 = el.start.y - el.y;
  const x2 = el.end.x - el.x;
  const y2 = el.end.y - el.y;
  if (el.kind === 'straight') return `M${x1} ${y1} L${x2} ${y2}`;
  if (el.kind === 'curve') {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * Math.min(40, len * 0.25);
    const ny = (dx / len) * Math.min(40, len * 0.25);
    return `M${x1} ${y1} Q${mx + nx} ${my + ny} ${x2} ${y2}`;
  }
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} L${mx} ${y1} L${mx} ${y2} L${x2} ${y2}`;
}

const ARROW_MARKER_ID = 'jkinco-arrow-marker';

// ---------------------------------------------------------------------------
// Element renderers
// ---------------------------------------------------------------------------

export const ElementView = memo(function ElementView({
  element,
  theme,
  selected,
  isEditing,
}: {
  element: SlideElement;
  theme: Theme;
  selected: boolean;
  isEditing: boolean;
}) {
  if (element.hidden) return null;
  const common: React.CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.w,
    height: element.h,
    opacity: element.opacity,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    pointerEvents: element.locked ? 'none' : 'auto',
  };

  switch (element.type) {
    case 'text':
      return (
        <div style={common} data-element-id={element.id}>
          <RichTextView text={element.text} style={element.style} width={element.w} height={element.h} verticalAlign={element.verticalAlign} />
        </div>
      );
    case 'shape':
      return <ShapeView element={element} common={common} isEditing={isEditing} />;
    case 'image':
      return (
        <div style={{ ...common, overflow: 'hidden', borderRadius: element.radius ?? 0 }} data-element-id={element.id}>
          <img
            src={element.src}
            alt={element.alt ?? ''}
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: element.objectFit,
              filter: element.filter,
              pointerEvents: 'none',
            }}
          />
        </div>
      );
    case 'connector':
      return <ConnectorView element={element} common={common} />;
    case 'chart':
      return <ChartView element={element} common={common} theme={theme} />;
    case 'table':
      return <TableView element={element} common={common} />;
    case 'group':
    case 'diagram':
      return null; // children render individually
    case 'media':
      return (
        <div style={{ ...common, background: '#0F172A', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-element-id={element.id}>
          <svg viewBox="0 0 24 24" width="28%" height="28%" fill="#94A3B8">
            <polygon points="8,5 19,12 8,19" />
          </svg>
        </div>
      );
    default:
      return null;
  }
});

function ShapeView({ element, common, isEditing }: { element: Extract<SlideElement, { type: 'shape' }>; common: React.CSSProperties; isEditing: boolean }) {
  const fill = element.fill.type === 'solid' ? element.fill.color ?? '#FFFFFF' : 'none';
  const fillOpacity = element.fill.opacity ?? 1;
  const dash = element.stroke.style === 'dashed' ? '8 6' : element.stroke.style === 'dotted' ? '2 4' : undefined;
  return (
    <div style={common} data-element-id={element.id}>
      <svg width={element.w} height={element.h} viewBox={`0 0 ${element.w} ${element.h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path
          d={shapePath(element.shape, element.w, element.h, element.radius ?? 0)}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={element.stroke.color}
          strokeWidth={element.stroke.width}
          strokeDasharray={dash}
        />
      </svg>
      {element.text && !isEditing && (
        <div style={{ position: 'absolute', inset: 0, padding: element.radius ? 8 : 4, display: 'flex' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <RichTextView
              text={element.text}
              style={{
                ...(element.textStyle ?? {}),
                fontSize: element.textStyle?.fontSize ?? 16,
                color: element.textStyle?.color ?? '#1E293B',
                align: element.textStyle?.align ?? 'center',
              }}
              width={element.w - (element.radius ? 16 : 8)}
              height={element.h - 8}
              verticalAlign="middle"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectorView({ element, common }: { element: Extract<SlideElement, { type: 'connector' }>; common: React.CSSProperties }) {
  const dash = element.stroke.style === 'dashed' ? '8 6' : element.stroke.style === 'dotted' ? '2 4' : undefined;
  const marker = element.endArrow !== 'none' ? `url(#${ARROW_MARKER_ID}-${element.endArrow})` : undefined;
  const startMarker = element.startArrow !== 'none' ? `url(#${ARROW_MARKER_ID}-${element.startArrow})` : undefined;
  return (
    <div style={{ ...common, overflow: 'visible' }} data-element-id={element.id}>
      <svg width={element.w} height={element.h} viewBox={`0 0 ${element.w} ${element.h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs>
          <marker id={`${ARROW_MARKER_ID}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill={element.stroke.color} />
          </marker>
          <marker id={`${ARROW_MARKER_ID}-dot`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
            <circle cx="5" cy="5" r="4" fill={element.stroke.color} />
          </marker>
          <marker id={`${ARROW_MARKER_ID}-diamond`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M5 0 L10 5 L5 10 L0 5 Z" fill={element.stroke.color} />
          </marker>
        </defs>
        <path
          d={connectorPath(element)}
          fill="none"
          stroke={element.stroke.color}
          strokeWidth={element.stroke.width}
          strokeDasharray={dash}
          markerEnd={marker}
          markerStart={startMarker}
        />
      </svg>
      {element.label && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-60%)',
            background: 'rgba(255,255,255,0.9)',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          <RichTextView text={element.label} style={{ fontSize: 11, color: '#475569', align: 'center' }} width={120} height={16} verticalAlign="middle" />
        </div>
      )}
    </div>
  );
}

function ChartView({ element, common, theme }: { element: Extract<SlideElement, { type: 'chart' }>; common: React.CSSProperties; theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ setOption: (o: unknown) => void; resize: () => void; dispose: () => void } | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    let disposed = false;
    let chart: { setOption: (o: unknown) => void; resize: () => void; dispose: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    timer = setTimeout(() => {
      if (disposed || !ref.current) return;
      import('echarts').then((echarts) => {
        if (disposed || !ref.current) return;
        try {
          chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
          chart.setOption(buildEChartsOption(element, theme));
          chartRef.current = chart;
        } catch {
          setFallback(true);
        }
      });
    }, 0);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      chart?.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id]);

  useEffect(() => {
    chartRef.current?.setOption(buildEChartsOption(element, theme));
  }, [element, theme]);

  if (fallback) {
    return (
      <div style={{ ...common, border: '1px solid #CBD5E1', borderRadius: 8, padding: 12 }} data-element-id={element.id}>
        <div style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>{textToPlain(element.title)}</div>
        {element.series.slice(0, 3).map((s, i) => (
          <div key={i} style={{ fontSize: 11, color: '#94A3B8' }}>
            {s.name}: {s.data.map(String).join(' / ')}
          </div>
        ))}
      </div>
    );
  }
  return <div style={common} data-element-id={element.id} data-chart={element.chartType} ref={ref} />;
}

function TableView({ element, common }: { element: Extract<SlideElement, { type: 'table' }>; common: React.CSSProperties }) {
  const borderColor = element.border?.color ?? '#CBD5E1';
  return (
    <div style={{ ...common, overflow: 'hidden', borderRadius: 6 }} data-element-id={element.id}>
      <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          {element.colWidths.map((cw, i) => (
            <col key={i} style={{ width: cw }} />
          ))}
        </colgroup>
        <tbody>
          {element.cells.map((row, ri) => (
            <tr key={ri} style={{ height: element.rowHeights[ri] }}>
              {row.map((cell, ci) => {
                const isHeader = element.headerRow && ri === 0;
                const banded = element.bandedRows && !isHeader && ri % 2 === 0;
                return (
                  <td
                    key={ci}
                    colSpan={cell.colspan}
                    rowSpan={cell.rowspan}
                    style={{
                      border: `1px solid ${borderColor}`,
                      background: isHeader ? '#E8F0FA' : cell.fill ?? (banded ? '#F8FAFC' : '#FFFFFF'),
                      verticalAlign: 'middle',
                      padding: '2px 8px',
                      overflow: 'hidden',
                    }}
                  >
                    <RichTextView
                      text={cell.text}
                      style={{
                        fontSize: 13,
                        color: cell.color ?? '#1E293B',
                        bold: isHeader || cell.bold,
                        align: cell.align ?? 'center',
                      }}
                      width={(element.colWidths[ci] ?? 80) - 16}
                      height={(element.rowHeights[ri] ?? 30) - 4}
                      verticalAlign="middle"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function elementLabel(element: SlideElement): string {
  const typeLabels: Record<string, string> = {
    text: '文字',
    shape: '形状',
    image: '图片',
    connector: '连接线',
    chart: '图表',
    table: '表格',
    diagram: '图示',
    group: '组合',
    media: '媒体',
  };
  const text = element.type === 'text' || element.type === 'shape' ? textToPlain((element as { text?: RichText }).text).slice(0, 12) : '';
  return element.name ?? (text ? `${typeLabels[element.type] ?? '元素'}: ${text}` : (typeLabels[element.type] ?? '元素'));
}
