import {
  $createTableNode,
  $createTableRowNode,
  $createTableCellNode,
  $isTableNode,
  TableCellHeaderStates,
  TableNode,
  TableRowNode,
  TableCellNode,
} from '@lexical/table'
import { $createParagraphNode, $createTextNode } from 'lexical'
import type { MultilineElementTransformer } from '@lexical/markdown'

const TABLE_ROW_REG = /^\|(.+)\|/
const TABLE_DIVIDER_ROW_REG = /^\|[\s|:-]+\|$/

function parseCells(line: string): string[] {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((s) => s.trim())
}

export const TABLE_TRANSFORMER: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],

  export: (node) => {
    if (!$isTableNode(node)) return null
    const rows = node.getChildren() as TableRowNode[]
    if (!rows.length) return null

    const lines: string[] = []
    rows.forEach((row, rowIdx) => {
      const cells = (row.getChildren() as TableCellNode[]).map((cell) =>
        cell.getTextContent().trim(),
      )
      lines.push(`| ${cells.join(' | ')} |`)
      if (rowIdx === 0) {
        lines.push(`| ${cells.map(() => '---').join(' | ')} |`)
      }
    })
    return lines.join('\n')
  },

  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    // Collect all consecutive table rows
    let end = startLineIndex
    while (end < lines.length && TABLE_ROW_REG.test(lines[end])) {
      end++
    }
    end--

    const tableLines = lines
      .slice(startLineIndex, end + 1)
      .filter((l) => !TABLE_DIVIDER_ROW_REG.test(l))

    if (!tableLines.length) return null

    const tableNode = $createTableNode()
    tableLines.forEach((line, rowIdx) => {
      const row = $createTableRowNode()
      parseCells(line).forEach((cellText) => {
        const headerState =
          rowIdx === 0 ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS
        const cell = $createTableCellNode(headerState)
        const p = $createParagraphNode()
        if (cellText) p.append($createTextNode(cellText))
        cell.append(p)
        row.append(cell)
      })
      tableNode.append(row)
    })

    rootNode.append(tableNode)
    return [true, end]
  },

  regExpStart: TABLE_ROW_REG,
  replace: () => false,
  type: 'multiline-element',
}
