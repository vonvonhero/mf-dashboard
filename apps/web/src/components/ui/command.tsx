import { Command as CommandPrimitive } from "cmdk";
import type { ComponentPropsWithoutRef, ElementRef, Ref } from "react";
import { cn } from "../../lib/utils";

interface CommandProps extends ComponentPropsWithoutRef<typeof CommandPrimitive> {
  ref?: Ref<ElementRef<typeof CommandPrimitive>>;
}

function Command({ className, ref, ...props }: CommandProps) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
        className,
      )}
      {...props}
    />
  );
}

interface CommandListProps extends ComponentPropsWithoutRef<typeof CommandPrimitive.List> {
  ref?: Ref<ElementRef<typeof CommandPrimitive.List>>;
}

function CommandList({ className, ref, ...props }: CommandListProps) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn("max-h-[300px] overflow-y-auto overflow-x-hidden", className)}
      {...props}
    />
  );
}

interface CommandGroupProps extends ComponentPropsWithoutRef<typeof CommandPrimitive.Group> {
  ref?: Ref<ElementRef<typeof CommandPrimitive.Group>>;
}

function CommandGroup({ className, ref, ...props }: CommandGroupProps) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

interface CommandItemProps extends ComponentPropsWithoutRef<typeof CommandPrimitive.Item> {
  ref?: Ref<ElementRef<typeof CommandPrimitive.Item>>;
}

function CommandItem({ className, ref, ...props }: CommandItemProps) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Command, CommandList, CommandGroup, CommandItem };
