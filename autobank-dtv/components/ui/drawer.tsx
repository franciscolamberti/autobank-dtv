'use client'

import * as React from 'react'

import {
  Sheet as SheetRoot,
  SheetTrigger as SheetTrigger,
  SheetClose as SheetClose,
  SheetContent as SheetContent,
  SheetHeader as SheetHeader,
  SheetFooter as SheetFooter,
  SheetTitle as SheetTitle,
  SheetDescription as SheetDescription,
} from '@/components/ui/sheet'

// Drawer shim implemented on top of Sheet to avoid the vaul dependency.

function Drawer({ ...props }: React.ComponentProps<typeof SheetRoot>) {
  return <SheetRoot data-slot="drawer" {...props} />
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof SheetTrigger>) {
  return <SheetTrigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: React.ComponentProps<typeof SheetClose>) {
  return <SheetClose data-slot="drawer-close" {...props} />
}

function DrawerContent({
  ...props
}: React.ComponentProps<typeof SheetContent>) {
  return <SheetContent data-slot="drawer-content" {...props} />
}

function DrawerHeader({ ...props }: React.ComponentProps<'div'>) {
  return <SheetHeader data-slot="drawer-header" {...props} />
}

function DrawerFooter({ ...props }: React.ComponentProps<'div'>) {
  return <SheetFooter data-slot="drawer-footer" {...props} />
}

function DrawerTitle({
  ...props
}: React.ComponentProps<typeof SheetTitle>) {
  return <SheetTitle data-slot="drawer-title" {...props} />
}

function DrawerDescription({
  ...props
}: React.ComponentProps<typeof SheetDescription>) {
  return <SheetDescription data-slot="drawer-description" {...props} />
}

// Portal/Overlay shims are no-ops since Sheet handles them internally
const DrawerPortal = ({ children }: { children?: React.ReactNode }) => <>{children}</>
const DrawerOverlay = ({ children }: { children?: React.ReactNode }) => <>{children}</>

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
