import { cva } from 'class-variance-authority';

export const buttonVariants = cva('tw-flex tw-justify-center tw-items-center tw-font-medium', {
  variants: {
    variant: {
      primary: `
          tw-text-text-on-solid tw-bg-button-primary hover:tw-bg-button-primary-hover
          active:tw-bg-button-primary-pressed active:tw-border-border-accent-strong
          disabled:tw-bg-button-primary-disabled tw-border-none
          tw-interactice-focus tw-focus-visible:tw-outline-none tw-shadow-[0px_1px_0px_0px_rgba(0,0,0,0.10)]`,
      secondary: `
          tw-text-text-default tw-border tw-border-solid tw-border-border-accent-weak
          tw-bg-button-secondary hover:tw-border-border-accent-strong
          hover:tw-bg-button-secondary-hover active:tw-bg-button-secondary-pressed
          active:tw-border-border-accent-strong 
          disabled:tw-border-border-default 
          disabled:tw-bg-button-secondary-disabled disabled:tw-text-text-disabled  
          tw-focus-visible:tw-border-border-accent-weak
          tw-interactive-focus-nonsolid  tw-focus-visible:tw-outline-none tw-shadow-[0px_1px_0px_0px_rgba(0,0,0,0.10)]`,
      outline: `
          tw-text-text-default tw-border tw-border-solid tw-border-border-default
          tw-bg-button-secondary hover:tw-border-border-default
          hover:tw-bg-button-outline-hover active:tw-bg-button-outline-pressed
          active:tw-border-border-strong 
          disabled:tw-border-border-default 
          disabled:tw-bg-button-outline-disabled disabled:tw-text-text-disabled 
          tw-focus-visible:tw-border-border-default
          tw-interactive-focus-nonsolid tw-focus-visible:tw-interactive-focus-outline tw-shadow-[0px_1px_0px_0px_rgba(0,0,0,0.10)]`,
      ghost: `
          tw-border-none tw-text-text-default tw-bg-[#ffffff00] hover:tw-bg-button-outline-hover
          active:tw-bg-button-outline-pressed tw-focus-visible:tw-bg-button-outline disabled:tw-bg-transparent
          tw-interactive-focus-nonsolid tw-disabled:tw-text-text-disabled tw-focus-visible:tw-interactive-focus-outline tw-border-none`,
      ghostBrand: `
          tw-border-none tw-text-text-accent tw-bg-[#ffffff00] hover:tw-bg-button-secondary-hover
          active:tw-bg-button-secondary-pressed tw-focus-visible:tw-bg-button-outline
          tw-disabled:tw-text-text-disabled tw-focus-visible:tw-interactive-focus-outline tw-border-none tw-interactive-focus-nonsolid`,
      dangerPrimary: `
          tw-text-text-on-solid tw-bg-button-danger-primary hover:tw-bg-button-danger-primary-hover
          active:tw-bg-button-danger-primary-pressed disabled:tw-bg-button-danger-primary-disabled
          tw-border-none tw-interactice-focus tw-focus-visible:tw-outline-none tw-shadow-[0px_1px_0px_0px_rgba(0,0,0,0.10)]`,
      dangerSecondary: `
          tw-text-text-default tw-border tw-border-solid tw-border-border-danger-weak
          tw-bg-button-secondary hover:tw-border-border-danger-strong
          hover:tw-bg-button-danger-secondary-hover
          active:tw-border-border-danger-strong active:tw-bg-button-danger-secondary-pressed
          tw-disabled:tw-text-text-disabled tw-disabled:tw-border-border-default 
          tw-disabled:tw-bg-button-danger-secondary-disabled
          tw-focus-visible:tw-border-border-danger-weak tw-focus-visible:tw-interactive-focus-outline tw-interactive-focus-nonsolid tw-shadow-[0px_1px_0px_0px_rgba(0,0,0,0.10)]`,
    },
    size: {
      large: `tw-h-[40px] tw-gap-[8px] tw-py-[10px] tw-rounded-[10px] tw-text-lg`,
      default: `tw-h-[32px] tw-gap-[6px] tw-py-7px] tw-rounded-[8px] tw-text-base`,
      medium: `tw-h-[28px] tw-gap-[6px] tw-py-[5px] tw-rounded-[6px] tw-text-base`,
      small: `tw-h-[20px] tw-gap-[4px] tw-py-[2px] tw-rounded-[4px] tw-text-sm`,
    },
  },

  compoundVariants: [
    {
      iconOnly: true,
      size: 'large',
      className: 'tw-w-[40px] tw-px-[10px]',
    },
    {
      iconOnly: true,
      size: 'default',
      className: 'tw-w-[32px] tw-px-[7px]',
    },
    {
      iconOnly: true,
      size: 'medium',
      className: 'tw-w-[28px] tw-px-[5px]',
    },
    {
      iconOnly: true,
      size: 'small',
      className: 'tw-w-[20px] tw-px-[2px]',
    },
    {
      iconOnly: false,
      size: 'large',
      className: 'tw-px-[20px]',
    },
    {
      iconOnly: false,
      size: 'default',
      className: 'tw-px-[12px]',
    },
    {
      iconOnly: false,
      size: 'medium',
      className: 'tw-px-[10px]',
    },
    {
      iconOnly: false,
      size: 'small',
      className: 'tw-px-[8px]',
    },
  ],

  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
});
