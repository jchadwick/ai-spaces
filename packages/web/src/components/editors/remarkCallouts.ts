import { visit } from 'unist-util-visit'
import type { Root, Blockquote, Paragraph, Text } from 'mdast'
import type { Plugin } from 'unified'

const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i

export const remarkCallouts: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'blockquote', (node: Blockquote) => {
    const firstChild = node.children[0]
    if (firstChild?.type !== 'paragraph') return
    const para = firstChild as Paragraph
    const firstText = para.children[0]
    if (firstText?.type !== 'text') return
    const text = firstText as Text
    const match = ALERT_RE.exec(text.value)
    if (!match) return

    const alertType = match[1].toUpperCase() as 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION'

    // Strip the [!TYPE] prefix from the first text node
    text.value = text.value.slice(match[0].length)
    // If the paragraph is now empty, remove it
    if (text.value.trim() === '' && para.children.length === 1) {
      node.children.shift()
    }

    // Attach hast properties so react-markdown routes to custom component
    node.data = node.data ?? {}
    node.data.hProperties = {
      ...(node.data.hProperties as object | undefined ?? {}),
      'data-callout': alertType,
    }
  })
}
