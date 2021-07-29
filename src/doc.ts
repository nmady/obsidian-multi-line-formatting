import { Editor } from 'obsidian';

export default class NRDoc {

    selectedContent(doc:Editor): string[] {
        const selectedText = doc.getSelection()
        // const trimmedContent = selectedText.trim();
        return selectedText.split('\n')
      }

    isLineStart(doc:Editor): boolean {
        console.log(doc.getCursor('from'))
        console.log(doc.getCursor('from').ch)
        if (doc.getCursor('from').ch == 0) {
            return true
        }
        return false
    }

}