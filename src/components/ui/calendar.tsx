import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Calendar({
  className,
  classNames,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      className={cn("p-3", className)}
      showOutsideDays
      classNames={{
        months: "relative flex flex-col gap-4",
        month: "space-y-4",
        month_caption: "flex h-9 items-center justify-center px-10",
        caption_label: "text-sm font-medium",
        dropdowns: "flex items-center gap-2 text-sm font-medium",
        dropdown_root: "relative",
        dropdown: "absolute inset-0 w-full cursor-pointer opacity-0",
        chevron: "size-4",
        nav: "absolute inset-x-0 top-0 flex justify-between",
        button_previous: cn(buttonVariants({ variant: "outline", size: "icon" }), "size-9"),
        button_next: cn(buttonVariants({ variant: "outline", size: "icon" }), "size-9"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-xs text-muted-foreground",
        week: "mt-1 flex",
        day: "size-9 text-center text-sm",
        day_button: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9 font-normal"),
        selected:
          "rounded-md bg-primary text-primary-foreground [&_button]:bg-primary [&_button]:text-primary-foreground",
        today: "rounded-md bg-accent text-accent-foreground",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
        DayButton: ({ day, modifiers, ...buttonProps }) => (
          <Button variant="ghost" size="icon" {...buttonProps} />
        ),
      }}
      {...props}
    />
  );
}
