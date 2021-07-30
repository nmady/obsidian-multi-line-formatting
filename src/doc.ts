import { Editor } from 'obsidian';

export default class NRDoc {

    selectedContent(doc:Editor): string[] {
        const selectedText = doc.getSelection()
        // const trimmedContent = selectedText.trim();
        return selectedText.split('\n')
      }

}