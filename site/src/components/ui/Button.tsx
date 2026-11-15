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
      destructive: 'btn-destructive',
      row: 'btn-row',
      chip: 'chip',
      link: 'btn-link',
    },
    size: {
      default: 'min-h-[60px] px-6 text-base',
      sm: 'min-h-[56px] px-5 text-sm',
      lg: 'min-h-[68px] px-8 text-base',
      xl: 'min-h-[76px] px-9 text-lg',
      icon: 'size-14 p-0',
      'icon-sm': 'size-12 p-0',
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
        data-size={size ?? 'default'}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'

export default Button
export { buttonVariants }
