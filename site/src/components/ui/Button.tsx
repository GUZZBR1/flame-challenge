import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '../../lib/cn'

const buttonVariants = cva('btn', {
  variants: {
    variant: {
      default: 'btn-ink',
      primary: 'btn-ink',
      ink: 'btn-ink',
      accent: 'btn-accent',
      glass: 'btn-ghost',
      outline: 'btn-ghost',
      secondary: 'btn-ghost',
      ghost: 'btn-ghost',
      destructive: 'btn-rec',
      chip: 'chip',
      rec: 'btn-rec',
      recording: 'btn-rec',
      link: 'btn-link',
    },
    size: {
      default: 'h-11 px-5 text-sm',
      sm: 'h-10 px-4 text-xs',
      lg: 'h-12 px-6 text-sm',
      xl: 'h-14 px-8 text-base',
      icon: 'h-10 w-10 p-0',
      'icon-sm': 'h-9 w-9 p-0',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export type ButtonProps = Omit<React.ComponentProps<'button'>, 'size'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Component = asChild ? Slot : 'button'
    return (
      <Component
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'

export default Button
export { buttonVariants }
