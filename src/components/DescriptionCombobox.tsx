import { useState, useRef, useEffect } from 'react'
import { useSplitterStore, DEFAULT_DESCRIPTIONS } from '@/stores/splitter-store'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Bookmark, BookmarkCheck, X, ChevronDown } from 'lucide-react'

interface Props {
  value: string
  onChange: (val: string) => void
}

export function DescriptionCombobox({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  const savedDescriptions = useSplitterStore((s) => s.savedDescriptions)
  const saveDescription = useSplitterStore((s) => s.saveDescription)
  const removeDescription = useSplitterStore((s) => s.removeDescription)

  const isSaved = savedDescriptions.includes(value.trim())
  const isCustom = value.trim() !== '' && !DEFAULT_DESCRIPTIONS.includes(value.trim())

  // Sections to show in dropdown
  const filterText = query.trim().toLowerCase()
  const filteredSaved = savedDescriptions.filter(
    (d) => !filterText || d.toLowerCase().includes(filterText)
  )
  const filteredDefaults = DEFAULT_DESCRIPTIONS.filter(
    (d) =>
      (!filterText || d.toLowerCase().includes(filterText)) &&
      !savedDescriptions.includes(d)
  )
  const showAddOption =
    query.trim() !== '' &&
    !DEFAULT_DESCRIPTIONS.some((d) => d.toLowerCase() === query.trim().toLowerCase()) &&
    !savedDescriptions.some((d) => d.toLowerCase() === query.trim().toLowerCase())

  const hasOptions = filteredSaved.length > 0 || filteredDefaults.length > 0 || showAddOption

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const pick = (desc: string) => {
    onChange(desc)
    setQuery(desc)
    setOpen(false)
  }

  const handleInput = (val: string) => {
    setQuery(val)
    onChange(val)
    setOpen(true)
  }

  const handleSaveToggle = () => {
    if (isSaved) {
      removeDescription(value.trim())
    } else if (value.trim()) {
      saveDescription(value.trim())
    }
  }

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor="description">Description</Label>
        {value.trim() && (
          <button
            type="button"
            onClick={handleSaveToggle}
            title={isSaved ? 'Remove from saved' : 'Save for later'}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            {isSaved ? (
              <>
                <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
                <span className="text-primary">Saved</span>
              </>
            ) : (
              <>
                <Bookmark className="h-3.5 w-3.5" />
                <span>{isCustom ? 'Save this' : ''}</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="relative">
        <Input
          id="description"
          placeholder="Type or pick a description…"
          value={query}
          autoComplete="off"
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((v) => !v)}
          className="absolute right-2.5 top-2.5 text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {open && hasOptions && (
        <div className="absolute z-50 w-full rounded-lg border bg-popover shadow-md text-sm overflow-hidden">
          {filteredSaved.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50 font-semibold">
                Saved by you
              </div>
              {filteredSaved.map((d) => (
                <div
                  key={d}
                  className="flex items-center justify-between px-3 py-2 hover:bg-accent cursor-pointer group"
                >
                  <span onClick={() => pick(d)} className="flex-1">
                    {d}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDescription(d)}
                    title="Remove from saved"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </>
          )}

          {filteredDefaults.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50 font-semibold">
                Common expenses
              </div>
              {filteredDefaults.map((d) => (
                <div
                  key={d}
                  className="flex items-center justify-between px-3 py-2 hover:bg-accent cursor-pointer group"
                  onClick={() => pick(d)}
                >
                  <span>{d}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); saveDescription(d); }}
                    title="Save for later"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </>
          )}

          {showAddOption && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50 font-semibold">
                Custom
              </div>
              <div
                className="flex items-center justify-between px-3 py-2 hover:bg-accent cursor-pointer group"
                onClick={() => pick(query.trim())}
              >
                <span>
                  Use &quot;<strong>{query.trim()}</strong>&quot;
                </span>
                <button
                  type="button"
                  title="Use and save"
                  onClick={(e) => {
                    e.stopPropagation()
                    saveDescription(query.trim())
                    pick(query.trim())
                  }}
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-opacity"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Save
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
