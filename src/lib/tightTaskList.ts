import { TaskList } from '@tiptap/extension-task-list';

/**
 * TaskList extension with `tight: true` attribute (#1580).
 *
 * `tiptap-markdown`'s MarkdownTightLists only attaches `tight` to `bulletList`
 * and `orderedList`. Adding `tight: true` here ensures that ProseMirror's
 * markdown serializer treats task lists as tight (single newline between items),
 * avoiding spurious double-spaced blank lines (`\n\n`) on save and reload.
 */
export const TightTaskList =
  typeof TaskList?.extend === 'function'
    ? TaskList.extend({
        addAttributes() {
          return {
            tight: {
              default: true,
              parseHTML: (element) => element.getAttribute('data-tight') === 'true' || !element.querySelector('p'),
              renderHTML: (attributes) => ({
                'data-tight': attributes.tight ? 'true' : null,
              }),
            },
          };
        },
      })
    : TaskList;
