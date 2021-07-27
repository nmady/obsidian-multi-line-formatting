import { Editor } from 'obsidian';
export type ReplaceMode = 'split' | 'replace-selection' | 'replace-headings';

export default class NRDoc {

    selectedContent(doc:Editor): string[] {
        const selectedText = doc.getSelection()
        // const trimmedContent = selectedText.trim();
        return selectedText.split('\n')
      }

    noteRemainder(doc:Editor): string[] {
        doc.setCursor(doc.getCursor().line, 0);
        const currentLine = doc.getCursor();
        const endPosition = doc.offsetToPos(doc.getValue().length);
        const content = doc.getRange(currentLine, endPosition);
        const trimmedContent = content.trim();
        return trimmedContent.split('\n');
      }

}