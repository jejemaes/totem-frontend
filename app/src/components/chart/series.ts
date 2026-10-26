/*
 * The groups of a group-by response -> the `data` chart.js draws, with no
 * dependency on Vue nor on chart.js itself.
 *
 * The shape is fixed by a decision worth keeping in view: EVERY dimension is
 * joined into one label on the X axis, and each MEASURE is a series. Splitting
 * a second dimension into series would make the number of datasets depend on
 * the data (one per category ever booked), the legend unbounded, and a pie
 * meaningless. One label per group keeps each group exactly one point.
 */

import { groupLabel, measureValue } from './fields/labels'
import type { ChartFieldDeclaration, ChartType } from './fields/types'

export interface ChartDataset {
  label: string
  /** null is a gap -- a sum over nothing -- never a zero. */
  data: (number | null)[]
  backgroundColor?: string | string[]
  borderColor?: string | string[]
  borderWidth?: number
  tension?: number
}

/** What chart.js takes as `data`, the subset this view builds. */
export interface ChartData {
  labels: string[]
  datasets: ChartDataset[]
}

/**
 * One label per group, one dataset per measure, in the order picked. The
 * groups keep the backend's order: that is what "Order by" asked it for.
 */
export function buildChartData(
  groups: readonly Record<string, unknown>[],
  dimensions: readonly ChartFieldDeclaration[],
  measures: readonly ChartFieldDeclaration[],
  locale?: string,
): ChartData {
  return {
    labels: groups.map((group) => groupLabel(group, dimensions, locale)),
    datasets: measures.map((measure) => ({
      label: measure.label,
      data: groups.map((group) => measureValue(group[measure.name])),
    })),
  }
}

/**
 * The CSS variables the series are coloured from, in order. Variables, never a
 * hex value: the palette is the theme's (plugins/theme.ts), and these follow
 * the dark mode on their own. The identity's green first.
 */
export const CHART_COLOR_VARIABLES = [
  '--p-primary-color',
  '--p-sky-500',
  '--p-amber-500',
  '--p-rose-500',
  '--p-violet-500',
  '--p-teal-500',
  '--p-orange-500',
  '--p-indigo-500',
  '--p-lime-500',
  '--p-pink-500',
] as const

export interface ChartColors {
  /** The resolved colours of CHART_COLOR_VARIABLES. */
  palette: readonly string[]
  /** The panel behind the chart: what separates two slices of a pie. */
  surface: string
}

function colorAt(palette: readonly string[], index: number): string {
  return palette.length ? palette[index % palette.length] : ''
}

/**
 * Colours applied per type. A bar or a line takes ONE colour per dataset, so a
 * measure keeps its colour across the axis; a pie takes one per SLICE -- its
 * labels are the groups -- and every ring (one per measure) shares them, so a
 * slice reads the same on each ring.
 */
export function styleChartData(data: ChartData, type: ChartType, colors: ChartColors): ChartData {
  const datasets = data.datasets.map((dataset, index): ChartDataset => {
    if (type === 'pie') {
      return {
        ...dataset,
        backgroundColor: data.labels.map((_, slice) => colorAt(colors.palette, slice)),
        borderColor: colors.surface,
        borderWidth: 2,
      }
    }
    const color = colorAt(colors.palette, index)
    return {
      ...dataset,
      backgroundColor: color,
      borderColor: color,
      borderWidth: type === 'line' ? 2 : 0,
      ...(type === 'line' ? { tension: 0.25 } : {}),
    }
  })
  return { labels: data.labels, datasets }
}

/**
 * Whether a pie would lie: chart.js draws a slice from the ABSOLUTE value, so a
 * negative total (a balance of expenses) looks exactly like a positive one.
 * The view warns rather than refusing -- the size can still be what one wants.
 */
export function hasNegativeValue(data: ChartData): boolean {
  return data.datasets.some((dataset) => dataset.data.some((value) => value !== null && value < 0))
}
