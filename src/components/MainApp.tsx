import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AddExpenseDialog } from '@/components/AddExpenseDialog'
import { BalancesView } from '@/components/BalancesView'
import { HistoryView } from '@/components/HistoryView'
import { UsersSettings } from '@/components/UsersSettings'
import { UserMenu } from '@/components/UserMenu'
import { InviteByEmailDialog } from '@/components/InviteByEmailDialog'
import { useSplitterStore } from '@/stores/splitter-store'
import { Scale, History, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function MainApp() {
  const activeGroupId = useSplitterStore((s) => s.activeGroupId)
  const myGroups = useSplitterStore((s) => s.myGroups)
  const selectGroup = useSplitterStore((s) => s.selectGroup)

  const groupName = myGroups.find((g) => g.id === activeGroupId)?.name ?? 'Group'

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center gap-2 px-4">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Back to groups"
            onClick={() => void selectGroup(null)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">
              {groupName}
            </h1>
          </div>
          <InviteByEmailDialog />
          <UserMenu />
          <UsersSettings />
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 flex justify-center">
          <AddExpenseDialog />
        </div>

        <Tabs defaultValue="balances" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="balances" className="gap-2">
              <Scale className="h-4 w-4" />
              Balances
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="balances" className="mt-4">
            <BalancesView />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <HistoryView />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
