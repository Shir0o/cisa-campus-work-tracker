import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import TurndownService from 'turndown';
import { 
  FileText, 
  CheckSquare, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Check, 
  Calendar, 
  Bookmark, 
  ChevronRight, 
  Folder, 
  ArrowLeft, 
  Save, 
  Filter, 
  ShieldAlert, 
  PlusCircle, 
  X, 
  ChevronDown, 
  CheckCircle,
  HelpCircle,
  AlertCircle,
  Bold,
  Italic,
  Heading,
  List,
  Quote,
  Code,
  Link,
  Eye,
  EyeOff
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  subTasks: TodoItem[];
}

interface CoordinationNote {
  id: string;
  title: string;
  date: string;
  content: string;
  category: 'annual_planning' | 'semester_kickoff' | 'weekly_sync' | 'general';
  todos: TodoItem[];
  createdAt?: any;
  createdBy?: string;
  createdByName?: string;
  updatedAt?: any;
  updatedBy?: string;
  updatedByName?: string;
}

const CATEGORY_LABELS: Record<CoordinationNote['category'], string> = {
  annual_planning: 'Annual & regular planning',
  semester_kickoff: 'Semester Kickoff',
  weekly_sync: 'Weekly Sync',
  general: 'General Note'
};

const CATEGORY_COLORS: Record<CoordinationNote['category'], string> = {
  annual_planning: 'text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400',
  semester_kickoff: 'text-primary bg-primary/10 border-primary/20 dark:text-primary-light',
  weekly_sync: 'text-green-700 bg-green-500/10 border-green-500/20 dark:text-green-400',
  general: 'text-surface-variant font-medium bg-surface-container-highest border-outline-variant'
};

// Help helper for markdown guide
const MARKDOWN_CHEATSHEET = [
  { syntax: '# Header 1', result: 'Large Title' },
  { syntax: '## Header 2', result: 'Section Title' },
  { syntax: '**bold**', result: 'Bold text' },
  { syntax: '*italic*', result: 'Italic text' },
  { syntax: '- Item 1', result: 'Bullet List' },
  { syntax: '> Quote', result: 'Blockquote highlight' },
  { syntax: '[Link](url)', result: 'Hyperlink' },
  { syntax: '`code`', result: 'Inline monospace' }
];

interface EditableMarkdownPreviewProps {
  content: string;
  isEditingPreview: boolean;
  setIsEditingPreview: (editing: boolean) => void;
  onChange: (newMarkdown: string) => void;
  isSaving?: boolean;
}

const EditableMarkdownPreview = React.memo(({
  content,
  isEditingPreview,
  setIsEditingPreview,
  onChange,
  isSaving
}: EditableMarkdownPreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize TurndownService once
  const turndownService = useMemo(() => {
    const service = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
      codeBlockStyle: 'fenced'
    });

    // Handle standard anchor links without stripping protocols
    service.addRule('links', {
      filter: 'a',
      replacement: (content, node) => {
        const href = (node as HTMLAnchorElement).getAttribute('href');
        return href ? `[${content}](${href})` : content;
      }
    });

    return service;
  }, []);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    try {
      const markdown = turndownService.turndown(html);
      onChange(markdown);
    } catch (err) {
      console.warn("Turndown parsing failed: ", err);
    }
  };

  const handleFocus = () => {
    setIsEditingPreview(true);
  };

  const handleBlur = () => {
    setIsEditingPreview(false);
    // Sync one last time from elements to make sure parent has the absolute newest data
    if (containerRef.current) {
      try {
        const html = containerRef.current.innerHTML;
        const markdown = turndownService.turndown(html);
        onChange(markdown);
      } catch (err) {
        console.warn("Turndown backup parse on blur failed: ", err);
      }
    }
  };

  const displayContent = content || (isEditingPreview ? '' : '*No content yet. Click here to start typing meeting planning notes directly...*');

  return (
    <div
      ref={containerRef}
      contentEditable={!isSaving}
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="markdown-body focus:outline-none min-h-[300px] outline-none select-text cursor-text relative"
      style={{ minHeight: '300px' }}
    >
      <Markdown
        components={{
          h1: ({node, ...props}) => <h1 className="text-2xl font-bold tracking-tight text-on-surface mt-6 mb-3 first:mt-0 border-b border-outline-variant/30 pb-2" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xl font-bold tracking-tight text-on-surface mt-5 mb-2.5 border-b border-outline-variant/20 pb-1" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-lg font-bold tracking-tight text-on-surface mt-4 mb-2" {...props} />,
          p: ({node, ...props}) => <p className="text-sm text-on-surface-variant leading-relaxed mb-4 font-normal" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-2 text-sm text-on-surface-variant" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-4 space-y-2 text-sm text-on-surface-variant" {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary bg-primary/5 pl-4 py-3 italic my-4 rounded-r-1xl text-on-surface" {...props} />,
          code: ({node, ...props}) => <code className="font-mono text-xs bg-surface-container-high px-1.5 py-0.5 rounded text-primary" {...props} />,
          strong: ({node, ...props}) => <strong className="font-bold text-on-surface" {...props} />,
          em: ({node, ...props}) => <em className="italic text-on-surface" {...props} />,
          a: ({node, ...props}) => <a className="text-primary underline font-medium hover:text-primary/80" target="_blank" rel="noopener noreferrer" {...props} />,
        }}
      >
        {displayContent}
      </Markdown>
    </div>
  );
}, (prevProps, nextProps) => {
  // If editing preview state is changing, re-render to clear/restore placeholder
  if (prevProps.isEditingPreview !== nextProps.isEditingPreview) {
    return false;
  }
  // While editing, ignore external content updates to prevent cursor jumps
  if (nextProps.isEditingPreview) {
    return true;
  }
  return prevProps.content === nextProps.content && prevProps.isSaving === nextProps.isSaving;
});

export default function CoordinationNotes() {
  const { isAdmin, user } = useAuth();
  const isMe = user?.email?.toLowerCase() === 'yilongwang05@gmail.com';
  const hasAccess = isAdmin || isMe;

  const [notes, setNotes] = useState<CoordinationNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<CoordinationNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Editor state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategory, setEditCategory] = useState<CoordinationNote['category']>('general');
  const [editContent, setEditContent] = useState('');
  const [editTodos, setEditTodos] = useState<TodoItem[]>([]);
  const [editDirectly, setEditDirectly] = useState(false);
  const [isEditingPreview, setIsEditingPreview] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'notes' | 'todos'>('notes');
  const [isSaving, setIsSaving] = useState(false);
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Todo Inline input states (keyed by item ID, or 'root' for master list)
  const [todoInputMap, setTodoInputMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'coordination_notes'),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: CoordinationNote[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        } as CoordinationNote);
      });
      setNotes(items);
      setLoading(false);

      // Keep selectedNote up-to-date with remote updates
      if (selectedNote) {
        const updated = items.find(n => n.id === selectedNote.id);
        if (updated) {
          // Only update if not actively editing to avoid clobbering input
          if (!isEditing) {
            setSelectedNote(updated);
          }
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'coordination_notes');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin, selectedNote, isEditing]);

  const handleSelectNote = (note: CoordinationNote) => {
    setSelectedNote(note);
    setIsEditing(false);
    setEditTitle(note.title);
    setEditDate(note.date);
    setEditCategory(note.category);
    setEditContent(note.content);
    setEditTodos(note.todos || []);
    setActiveTab('notes');
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selectedText = text.substring(start, end);

      const replacement = prefix + (selectedText || '') + suffix;
      const newContent = text.substring(0, start) + replacement + text.substring(end);

      setEditContent(newContent);

      // Refocus and preserve selection
      setTimeout(() => {
        textarea.focus();
        const newStart = start + prefix.length;
        const newEnd = newStart + (selectedText || '').length;
        textarea.setSelectionRange(newStart, newEnd);
      }, 0);
    } else {
      // In live preview mode without a raw textarea
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        // Ensure the selection is actually inside the active editable preview element
        const editableContainer = document.querySelector('[contenteditable="true"]');
        if (editableContainer && editableContainer.contains(range.commonAncestorContainer)) {
          const selectedText = selection.toString();
          const repl = prefix + (selectedText || 'Text') + suffix;
          range.deleteContents();
          range.insertNode(document.createTextNode(repl));

          try {
            const turndownService = new TurndownService({
              headingStyle: 'atx',
              bulletListMarker: '-',
              emDelimiter: '*',
              strongDelimiter: '**',
              codeBlockStyle: 'fenced'
            });
            turndownService.addRule('links', {
              filter: 'a',
              replacement: (content, node) => {
                const href = (node as HTMLAnchorElement).getAttribute('href');
                return href ? `[${content}](${href})` : content;
              }
            });
            const markdown = turndownService.turndown(editableContainer.innerHTML);
            setEditContent(markdown);
          } catch (e) {
            console.warn("Turndown parsing layout failed: ", e);
          }
          return;
        }
      }

      // Fallback: simply append the syntax with placeholder
      setEditContent(prev => {
        const separator = prev && !prev.endsWith('\n') ? '\n' : '';
        return prev + separator + prefix + (suffix ? 'Text' : '') + suffix;
      });
    }
  };

  const handleCreateNewNote = async () => {
    if (!hasAccess) return;
    try {
      const notesRef = collection(db, 'coordination_notes');
      const newDocRef = doc(notesRef);
      const noteId = newDocRef.id;

      const dateStr = new Date().toISOString().split('T')[0];
      const newNote: CoordinationNote = {
        id: noteId,
        title: 'New Meeting Coordination Notes',
        date: dateStr,
        content: `# Meeting Notes: ${dateStr}\n\n### Action Items\nBrief overview of topics discussed.\n\n### Learnings for Future reference\n- What worked well:\n- What could be improved:`,
        category: 'general',
        todos: [
          { id: '1', text: 'Define coordination action plan', completed: false, subTasks: [] },
          { id: '2', text: 'Set review milestone meeting', completed: false, subTasks: [] }
        ],
        createdAt: serverTimestamp(),
        createdBy: user?.uid || '',
        createdByName: user?.displayName || user?.email || '',
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || '',
        updatedByName: user?.displayName || user?.email || ''
      };

      await setDoc(newDocRef, newNote);
      handleSelectNote(newNote);
      setIsEditing(true);
    } catch (error) {
      console.error('Error creating coordination notes:', error);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedNote || !hasAccess) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, 'coordination_notes', selectedNote.id);
      await updateDoc(docRef, {
        title: editTitle.trim() || 'Untitled Note',
        date: editDate || new Date().toISOString().split('T')[0],
        category: editCategory,
        content: editContent,
        todos: editTodos,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || '',
        updatedByName: user?.displayName || user?.email || ''
      });
      setIsEditing(false);
      
      // Update local state copy
      setSelectedNote(prev => prev ? {
        ...prev,
        title: editTitle.trim() || 'Untitled Note',
        date: editDate,
        category: editCategory,
        content: editContent,
        todos: editTodos
      } : null);
    } catch (error) {
      console.error('Failed saving meeting notes:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete these meeting notes?')) return;
    try {
      await deleteDoc(doc(db, 'coordination_notes', id));
      setSelectedNote(null);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to delete meeting note:', error);
    }
  };

  // --- RECURSIVE CHECKLIST MATH ENGINE ---
  const addRecursiveTodo = (items: TodoItem[], parentId: string | null, text: string): TodoItem[] => {
    if (parentId === null) {
      return [
        ...items,
        { id: Date.now().toString() + Math.random().toString(36).substring(2, 5), text, completed: false, subTasks: [] }
      ];
    }
    return items.map(item => {
      if (item.id === parentId) {
        return {
          ...item,
          subTasks: [
            ...item.subTasks,
            { id: Date.now().toString() + Math.random().toString(36).substring(2, 5), text, completed: false, subTasks: [] }
          ]
        };
      } else if (item.subTasks && item.subTasks.length > 0) {
        return {
          ...item,
          subTasks: addRecursiveTodo(item.subTasks, parentId, text)
        };
      }
      return item;
    });
  };

  const toggleRecursiveTodo = (items: TodoItem[], id: string): TodoItem[] => {
    return items.map(item => {
      if (item.id === id) {
        const nextCompleted = !item.completed;
        const toggleAll = (tasks: TodoItem[], val: boolean): TodoItem[] => {
          return tasks.map(t => ({
            ...t,
            completed: val,
            subTasks: toggleAll(t.subTasks, val)
          }));
        };
        return {
          ...item,
          completed: nextCompleted,
          subTasks: toggleAll(item.subTasks, nextCompleted)
        };
      } else if (item.subTasks && item.subTasks.length > 0) {
        return {
          ...item,
          subTasks: toggleRecursiveTodo(item.subTasks, id)
        };
      }
      return item;
    });
  };

  const deleteRecursiveTodo = (items: TodoItem[], id: string): TodoItem[] => {
    return items
      .filter(item => item.id !== id)
      .map(item => {
        if (item.subTasks && item.subTasks.length > 0) {
          return {
            ...item,
            subTasks: deleteRecursiveTodo(item.subTasks, id)
          };
        }
        return item;
      });
  };

  const updateRecursiveTodoText = (items: TodoItem[], id: string, text: string): TodoItem[] => {
    return items.map(item => {
      if (item.id === id) {
        return { ...item, text };
      } else if (item.subTasks && item.subTasks.length > 0) {
        return {
          ...item,
          subTasks: updateRecursiveTodoText(item.subTasks, id, text)
        };
      }
      return item;
    });
  };

  // Checklist action wrappers
  const handleAddTodo = (parentId: string | null) => {
    const inputKey = parentId || 'root';
    const text = todoInputMap[inputKey];
    if (!text || !text.trim()) return;

    setEditTodos(prev => addRecursiveTodo(prev, parentId, text.trim()));
    setTodoInputMap(prev => ({ ...prev, [inputKey]: '' }));
  };

  const handleToggleTodo = (id: string) => {
    setEditTodos(prev => toggleRecursiveTodo(prev, id));
  };

  const handleDeleteTodo = (id: string) => {
    setEditTodos(prev => deleteRecursiveTodo(prev, id));
  };

  const handleUpdateTodoText = (id: string, text: string) => {
    setEditTodos(prev => updateRecursiveTodoText(prev, id, text));
  };

  // Searching and Filtering
  const filteredNotes = useMemo(() => {
    return notes.filter((item) => {
      const matchesSearch = 
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.content?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [notes, searchQuery, categoryFilter]);

  // Handle Guard Authorization
  if (!hasAccess) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center" id="coordination-notes-guard">
        <div className="bg-error-container/10 border border-error-container/30 rounded-3xl p-12 max-w-xl mx-auto my-12 flex flex-col items-center">
          <div className="w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center mb-6">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-on-background">Access Denied</h2>
          <p className="text-on-surface-variant leading-relaxed mb-6">
            Meeting Coordination notes and Learnings logs are restricted to members with an Administrator role. If you believe this is in error, please contact an administrator to upgrade your access level.
          </p>
        </div>
      </div>
    );
  }

  // Helper to render nested checklist recursively
  const RecursiveTodoRenderer = ({ items, level = 0 }: { items: TodoItem[]; level: number }) => {
    return (
      <ul className="space-y-3.5 w-full">
        {items.map((item) => {
          const hasChildren = item.subTasks && item.subTasks.length > 0;
          return (
            <li 
              key={item.id} 
              className="flex flex-col gap-2.5 p-3 rounded-2xl bg-surface/50 border border-outline-variant/30 relative"
              style={{ paddingLeft: `${Math.min(level * 16 + 12, 64)}px` }}
            >
              {/* Vertical connector guide */}
              {level > 0 && (
                <div 
                  className="absolute left-[16px] top-0 bottom-0 w-0.5 bg-outline-variant/30"
                  style={{ left: `${(level - 1) * 16 + 20}px` }}
                />
              )}

              <div className="flex items-center gap-3 w-full">
                {/* Status Toggle Box */}
                <button
                  type="button"
                  onClick={() => handleToggleTodo(item.id)}
                  disabled={!isEditing}
                  className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all cursor-pointer ${
                    item.completed 
                      ? 'bg-success/20 border-success text-success' 
                      : 'border-outline hover:border-primary'
                  }`}
                >
                  {item.completed && <Check className="w-4 h-4 text-success" />}
                </button>

                {/* Inline Editing vs Text block */}
                {isEditing ? (
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => handleUpdateTodoText(item.id, e.target.value)}
                    className={`flex-1 bg-transparent border-b border-transparent focus:border-primary focus:outline-none text-sm text-on-surface py-0.5 ${
                      item.completed ? 'line-through text-on-surface-variant/40' : ''
                    }`}
                  />
                ) : (
                  <span className={`text-sm flex-1 font-medium ${
                    item.completed ? 'line-through text-on-surface-variant/40' : 'text-on-surface'
                  }`}>
                    {item.text}
                  </span>
                )}

                {/* Clear Delete Option only when editing notes */}
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTodo(item.id)}
                    className="p-1 px-2 border-none rounded bg-transparent text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                    title="Delete item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Recursive child lists */}
              {hasChildren && (
                <div className="mt-1">
                  <RecursiveTodoRenderer items={item.subTasks} level={level + 1} />
                </div>
              )}

              {/* Add Subtask panel when in edit mode */}
              {isEditing && (
                <div 
                  className="flex items-center gap-2 mt-1 w-full pl-3 md:pl-6"
                  style={{ paddingLeft: `${level === 0 ? 12 : 24}px` }}
                >
                  <PlusCircle className="w-3.5 h-3.5 text-on-surface-variant/50 shrink-0" />
                  <input
                    type="text"
                    placeholder="Add a nested sub-task..."
                    value={todoInputMap[item.id] || ''}
                    onChange={(e) => setTodoInputMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTodo(item.id);
                      }
                    }}
                    className="bg-transparent border-b border-dashed border-outline-variant text-xs py-1 focus:outline-none focus:border-primary text-on-surface placeholder:text-on-surface-variant/40 flex-1 min-w-[120px]"
                  />
                  {(todoInputMap[item.id]?.trim() || '') && (
                    <button
                      type="button"
                      onClick={() => handleAddTodo(item.id)}
                      className="text-[10px] font-bold bg-primary-container text-on-primary-container px-2 py-0.5 rounded-md hover:opacity-90 border-none transition-all cursor-pointer"
                    >
                      Add
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8" id="coordination-notes-panel">
      
      {/* Title & Stats Dashboard */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-regular tracking-tight text-on-background">Meeting Coordination &amp; Learnings</h1>
          <p className="text-sm text-on-surface-variant">Review event prep notes, checklists, biannual event learnings, and regular coordination files.</p>
        </div>

        <button
          onClick={handleCreateNewNote}
          className="flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-on-primary font-bold rounded-full hover:opacity-90 active:scale-95 transition-all shadow-md cursor-pointer shrink-0 border-none"
        >
          <Plus className="w-5 h-5" />
          <span>New Document</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left column: notes sidebar explorer */}
        <div className="lg:col-span-4 space-y-5 bg-surface-container border border-outline-variant p-4 sm:p-5 rounded-[2rem] shadow-xs">
          
          <div className="space-y-4">
            <h3 className="text-md font-bold tracking-tight text-on-surface">Documents Directory</h3>
            
            {/* Search items filter */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes & learnings..."
                className="w-full bg-surface border border-outline-variant rounded-full pl-10 pr-4 py-2.5 text-xs focus:ring-2 focus:ring-primary focus:outline-none transition-all placeholder:text-on-surface-variant/40 text-on-surface h-10"
              />
            </div>

            {/* Category selection */}
            <div className="flex items-center gap-2 pt-1 border-b border-outline-variant/30 pb-3">
              <Filter className="w-3.5 h-3.5 text-on-surface-variant/85 shrink-0" />
              <select
                aria-label="Category filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-on-surface-variant focus:outline-none flex-1 truncate py-1"
              >
                <option value="all">All Plan categories</option>
                <option value="annual_planning">Annual &amp; Regular Planning</option>
                <option value="semester_kickoff">Semester Kickoff</option>
                <option value="weekly_sync">Weekly Sync</option>
                <option value="general">General Note</option>
              </select>
            </div>
          </div>

          {/* List items scroll area */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="p-8 text-center bg-surface/40 rounded-2xl border border-dashed border-outline-variant/60">
                <Folder className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-2" />
                <p className="text-xs font-bold text-on-surface-variant/70">No files found</p>
                <p className="text-[10px] text-on-surface-variant/50">Try adjusting your filters or query</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredNotes.map((item) => {
                  const isSelected = selectedNote?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectNote(item)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer text-left relative overflow-hidden flex flex-col gap-2 ${
                        isSelected 
                          ? 'bg-secondary-container/20 border-secondary ring-1 ring-secondary/20' 
                          : 'bg-surface hover:bg-surface-variant/30 border-outline-variant/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs text-on-surface-variant/70 font-bold font-mono">
                          {item.date}
                        </span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${CATEGORY_COLORS[item.category]}`}>
                          {item.category === 'annual_planning' ? 'Annual/Biannual' : CATEGORY_LABELS[item.category]}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-on-surface leading-snug line-clamp-2">
                        {item.title}
                      </h4>
                      
                      {/* Short excerpt */}
                      <p className="text-xs text-on-surface-variant/70 line-clamp-1 prose leading-normal">
                        {item.content?.replace(/[#*>\-\[\]]/g, '').substring(0, 80)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: active document display & edit space */}
        <div className="lg:col-span-8">
          
          <AnimatePresence mode="wait">
            {!selectedNote ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="bg-surface-container border border-outline-variant p-10 sm:p-16 rounded-[2.5rem] text-center space-y-6 flex flex-col items-center justify-center min-h-[450px] shadow-sm"
              >
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
                  <FileText className="w-8 h-8" />
                </div>
                <div className="space-y-2 max-w-sm">
                  <h3 className="text-xl font-bold text-on-surface">No coordination note selected</h3>
                  <p className="text-xs text-on-surface-variant">
                    Review and search planning logs, event preparation, learnings and feedback notes. Select an item from the directory sidebar or generate a new document.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mt-4 text-left">
                  <div className="p-4 bg-surface rounded-2xl border border-outline-variant/30 space-y-1">
                    <span className="text-[10px] tracking-wider font-extrabold text-primary uppercase block">Annual Planning</span>
                    <p className="text-[10px] text-on-surface-variant">Centralize periodic event logistics to streamline recurring schedules.</p>
                  </div>
                  <div className="p-4 bg-surface rounded-2xl border border-outline-variant/30 space-y-1">
                    <span className="text-[10px] tracking-wider font-extrabold text-primary uppercase block">Sub-task delegation</span>
                    <p className="text-[10px] text-on-surface-variant">Infinite-depth checklists allow delegating tasks down to detailed line items.</p>
                  </div>
                  <div className="p-4 bg-surface rounded-2xl border border-outline-variant/30 space-y-1">
                    <span className="text-[10px] tracking-wider font-extrabold text-primary uppercase block">Lessons Learned</span>
                    <p className="text-[10px] text-on-surface-variant">Rich text notes stay saved for quick review next season.</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={selectedNote.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-container border border-outline-variant p-5 sm:p-8 rounded-[2rem] shadow-sm space-y-6"
              >
                {/* Header view / editing fields */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 border-b border-outline-variant/20 pb-5">
                  <div className="space-y-3.5 flex-1 w-full">
                    
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-on-surface-variant uppercase" htmlFor="notes-title-input">Document Title</label>
                          <input
                            id="notes-title-input"
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="Enter notes title..."
                            className="w-full text-xl font-bold bg-surface border border-outline-variant rounded-xl px-4 py-2.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-on-surface-variant uppercase" htmlFor="notes-date-input">Event / Meeting Date</label>
                            <input
                              id="notes-date-input"
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="w-full text-sm bg-surface border border-outline-variant rounded-xl px-4 py-2.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary h-11"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-on-surface-variant uppercase" htmlFor="notes-category-select">Document Category</label>
                            <select
                              id="notes-category-select"
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value as any)}
                              className="w-full text-sm bg-surface border border-outline-variant rounded-xl px-4 py-2.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary h-11"
                            >
                              <option value="general">General Note</option>
                              <option value="annual_planning">Annual &amp; Regular Planning</option>
                              <option value="semester_kickoff">Semester Kickoff</option>
                              <option value="weekly_sync">Weekly Sync</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2.5 items-center">
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${CATEGORY_COLORS[selectedNote.category]}`}>
                            {selectedNote.category === 'annual_planning' ? 'Annual/Biannual Planning' : CATEGORY_LABELS[selectedNote.category]}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-on-surface-variant font-mono">
                            <Calendar className="w-3.5 h-3.5" />
                            {selectedNote.date}
                          </span>
                        </div>
                        
                        <h2 className="text-2xl font-regular tracking-tight text-on-surface">
                          {selectedNote.title}
                        </h2>

                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-on-surface-variant/85 bg-surface/50 p-2.5 rounded-xl border border-outline-variant/30 w-fit">
                          <span>Updated:</span>
                          <strong className="font-semibold">{selectedNote.updatedByName || 'Unknown'}</strong>
                          {selectedNote.updatedAt && (
                            <>
                              <span>on</span>
                              <span className="font-mono">{new Date(selectedNote.updatedAt).toLocaleDateString()} {new Date(selectedNote.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Top Header Actions (Edit / Save / Cancel / Delete) */}
                  <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                    {isEditing ? (
                      <>
                        <button
                          onClick={handleSaveChanges}
                          disabled={isSaving}
                          className="flex items-center justify-center gap-1 px-4 py-2 bg-success text-on-success rounded-xl font-bold text-xs hover:opacity-90 active:scale-95 transition-all cursor-pointer border-none"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setEditTitle(selectedNote.title);
                            setEditDate(selectedNote.date);
                            setEditCategory(selectedNote.category);
                            setEditContent(selectedNote.content);
                            setEditTodos(selectedNote.todos || []);
                          }}
                          className="flex items-center justify-center gap-1 px-4 py-2 bg-surface border border-outline-variant hover:bg-surface-container-high rounded-xl text-on-surface font-bold text-xs active:scale-95 transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setIsEditing(true);
                            setEditTitle(selectedNote.title);
                            setEditDate(selectedNote.date);
                            setEditCategory(selectedNote.category);
                            setEditContent(selectedNote.content);
                            setEditTodos(selectedNote.todos || []);
                          }}
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary/10 text-primary rounded-xl font-bold text-xs hover:bg-primary/20 hover:text-primary active:scale-95 transition-all cursor-pointer border-none"
                        >
                          <Edit className="w-4 h-4" />
                          <span>Edit Document</span>
                        </button>
                        <button
                          onClick={() => handleDeleteNote(selectedNote.id)}
                          className="p-2 bg-transparent text-on-surface-variant hover:text-error hover:bg-error/10 border-none transition-colors duration-200 rounded-lg cursor-pointer"
                          title="Delete meeting document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Main Tabs Selection */}
                <div className="flex border-b border-outline-variant/30 p-1 bg-surface rounded-2xl max-w-md">
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border-none cursor-pointer flex items-center justify-center gap-2 ${
                      activeTab === 'notes'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>Notes &amp; Learnings</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('todos')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border-none cursor-pointer flex items-center justify-center gap-2 ${
                      activeTab === 'todos'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>Action Items ({editTodos?.length || 0})</span>
                  </button>
                </div>

                {/* Tab content displays */}
                <div>
                  <AnimatePresence mode="wait">
                    
                    {activeTab === 'notes' ? (
                      <motion.div
                        key="notes-tab"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-4"
                      >
                        {isEditing ? (
                          <div className="space-y-4 text-left font-sans">
                            {/* Toolbar or Switch Zone */}
                            {!editDirectly ? (
                              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-2.5 rounded-2xl border border-outline-variant/30 shadow-xs">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('**', '**')}
                                    className="p-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                                    title="Bold text (**bold**)"
                                  >
                                    <Bold className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('*', '*')}
                                    className="p-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                                    title="Italic text (*italic*)"
                                  >
                                    <Italic className="w-4 h-4" />
                                  </button>
                                  <div className="h-4 w-[1px] bg-outline-variant/40 mx-1" />
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('# ', '')}
                                    className="p-1 px-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent text-xs font-black font-mono"
                                    title="Heading 1"
                                  >
                                    H1
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('## ', '')}
                                    className="p-1 px-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent text-xs font-black font-mono"
                                    title="Heading 2"
                                  >
                                    H2
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('### ', '')}
                                    className="p-1 px-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent text-xs font-black font-mono"
                                    title="Heading 3"
                                  >
                                    H3
                                  </button>
                                  <div className="h-4 w-[1px] bg-outline-variant/40 mx-1" />
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('- ', '')}
                                    className="p-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                                    title="Bullet List"
                                  >
                                    <List className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('> ', '')}
                                    className="p-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                                    title="Blockquote"
                                  >
                                    <Quote className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('`', '`')}
                                    className="p-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                                    title="Inline Code"
                                  >
                                    <Code className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => insertMarkdown('[', '](url)')}
                                    className="p-2 hover:bg-surface-variant/40 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer border-none bg-transparent"
                                    title="Insert Link"
                                  >
                                    <Link className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditDirectly(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-xl hover:opacity-95 transition-all cursor-pointer border-none text-xs font-bold shadow-xs hover:shadow-sm"
                                    title="Switch to full-width raw editor"
                                  >
                                    <Code className="w-3.5 h-3.5" />
                                    <span>Edit Directly</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-2.5 rounded-2xl border border-outline-variant/30 shadow-xs">
                                <div className="flex items-center gap-2 pl-2">
                                  <Code className="w-4 h-4 text-primary" />
                                  <span className="text-sm font-semibold text-on-surface">Raw Markdown Editor</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  {/* Help tool */}
                                  <button
                                    type="button"
                                    onClick={() => setShowCheatsheet(!showCheatsheet)}
                                    className="text-xs text-on-surface-variant hover:text-primary font-medium flex items-center gap-1 border border-outline-variant/20 bg-transparent px-2.5 py-1 rounded-xl hover:bg-surface-variant/25 transition-all cursor-pointer"
                                  >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                    <span>{showCheatsheet ? 'Hide Help' : 'Formatting Help'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setEditDirectly(false)}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-surface-variant text-on-surface-variant border border-outline-variant/20 rounded-xl hover:bg-surface-variant/40 transition-all cursor-pointer text-xs font-bold"
                                    title="Switch back to interactive live preview editor"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Show Live Preview</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {showCheatsheet && editDirectly && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface p-4 rounded-2xl border border-outline-variant/40"
                              >
                                {MARKDOWN_CHEATSHEET.map((item, i) => (
                                  <div key={i} className="text-[11px] font-mono p-1">
                                    <span className="text-primary font-bold">{item.syntax}</span>
                                    <span className="text-on-surface-variant/70 block">{item.result}</span>
                                  </div>
                                ))}
                              </motion.div>
                            )}

                            {/* Dual panel split preview zone vs raw zone */}
                            {!editDirectly ? (
                              <div className="flex flex-col gap-2 min-h-[350px]">
                                <div className="flex items-center justify-between">
                                  <label className="text-[11.5px] font-bold text-on-surface-variant/80 uppercase">Interactive Live Preview & Editor</label>
                                  <span className="text-xs text-on-surface-variant/50">Changes are converted to formatted markdown automatically</span>
                                </div>
                                <div className="flex-1 bg-surface/40 rounded-[1.5rem] border border-outline-variant/30 p-5 sm:p-7 text-left prose dark:prose-invert max-w-none shadow-inner overflow-y-auto min-h-[300px] max-h-[500px]">
                                  <EditableMarkdownPreview
                                    content={editContent}
                                    isEditingPreview={isEditingPreview}
                                    setIsEditingPreview={setIsEditingPreview}
                                    onChange={setEditContent}
                                    isSaving={isSaving}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <label className="text-[11.5px] font-bold text-on-surface-variant/80 uppercase">Markdown Content (Raw Editor)</label>
                                <textarea
                                  ref={textareaRef}
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  rows={15}
                                  placeholder="Type in markdown content. You can write tables, checkmarks, bullet items, blockquotes, and links."
                                  className="w-full bg-surface text-on-surface rounded-2xl border border-outline-variant/50 p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="bg-surface/40 rounded-[1.5rem] border border-outline-variant/30 p-5 sm:p-7 text-left prose dark:prose-invert max-w-none shadow-inner">
                            <div className="markdown-body">
                              <Markdown
                                components={{
                                  h1: ({node, ...props}) => <h1 className="text-2xl font-bold tracking-tight text-on-surface mt-6 mb-3 first:mt-0 border-b border-outline-variant/30 pb-2" {...props} />,
                                  h2: ({node, ...props}) => <h2 className="text-xl font-bold tracking-tight text-on-surface mt-5 mb-2.5 border-b border-outline-variant/20 pb-1" {...props} />,
                                  h3: ({node, ...props}) => <h3 className="text-lg font-bold tracking-tight text-on-surface mt-4 mb-2" {...props} />,
                                  p: ({node, ...props}) => <p className="text-sm text-on-surface-variant leading-relaxed mb-4 font-normal" {...props} />,
                                  ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-2 text-sm text-on-surface-variant" {...props} />,
                                  ol: ({node, ...props}) => <ol className="list-decimal pl-6 mb-4 space-y-2 text-sm text-on-surface-variant" {...props} />,
                                  li: ({node, ...props}) => <li className="pl-1" {...props} />,
                                  blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary bg-primary/5 pl-4 py-3 italic my-4 rounded-r-2xl text-on-surface" {...props} />,
                                  code: ({node, ...props}) => <code className="font-mono text-xs bg-surface-container-high px-1.5 py-0.5 rounded text-primary" {...props} />,
                                  strong: ({node, ...props}) => <strong className="font-bold text-on-surface" {...props} />,
                                  em: ({node, ...props}) => <em className="italic text-on-surface" {...props} />,
                                  a: ({node, ...props}) => <a className="text-primary underline font-medium hover:text-primary/80" target="_blank" rel="noopener noreferrer" {...props} />,
                                }}
                              >
                                {selectedNote.content || '*No content provided. Click Edit to add meeting planning notes.*'}
                              </Markdown>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="todos-tab"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6 text-left"
                      >
                        <div className="bg-surface-container-high/40 rounded-2xl border border-outline-variant/20 p-4 flex items-start gap-2.5 text-xs text-on-surface-variant mb-2">
                          <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <p className="leading-normal">
                            <strong>Interactive Checklist Info:</strong> 
                            {isEditing 
                              ? ' You are in editing mode. You can check off tasks, change titles, add recursive sub-tasks, or delete items. Your modifications will be saved once you click "Save Draft" in the header.' 
                              : ' You are in view-only mode. Click "Edit Document" first in the header to modify, check off, or add new items to the checklist.'
                            }
                          </p>
                        </div>

                        {/* Top-Level Master task adder */}
                        {isEditing && (
                          <div className="flex gap-2.5 pb-2">
                            <input
                              type="text"
                              aria-label="New main action item"
                              placeholder="Add a new main action item / todo..."
                              value={todoInputMap['root'] || ''}
                              onChange={(e) => setTodoInputMap(prev => ({ ...prev, root: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddTodo(null);
                                }
                              }}
                              className="flex-1 bg-surface border border-outline-variant rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-on-surface"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddTodo(null)}
                              disabled={!todoInputMap['root']?.trim()}
                              className="px-4 py-2 bg-primary text-on-primary rounded-xl font-bold text-xs hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all border-none cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Add Title Task</span>
                            </button>
                          </div>
                        )}

                        {/* Infinite Sub-task List renderer */}
                        {editTodos.length === 0 ? (
                          <div className="p-12 text-center bg-surface/30 rounded-2xl border border-dashed border-outline-variant/60">
                            <CheckSquare className="w-10 h-10 text-on-surface-variant/20 mx-auto mb-3" />
                            <h4 className="text-sm font-bold text-on-surface-variant/70">Checklist is empty</h4>
                            <p className="text-xs text-on-surface-variant/50">
                              {isEditing ? 'Enter a parent item above to bootstrap the checklist' : 'This workspace has no registered action items.'}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                            <RecursiveTodoRenderer items={editTodos} level={0} />
                          </div>
                        )}
                      </motion.div>
                    )}

                  </AnimatePresence>
                </div>

              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </div>

    </div>
  );
}
