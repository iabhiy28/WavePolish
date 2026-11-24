import type { ComponentProps } from 'react';
import { Root, Thumb } from '@radix-ui/react-switch';

export function Switch({className,...props}:ComponentProps<typeof Root>){
 return <Root data-slot="switch" className={className?'switch '+className:'switch'} {...props}>
  <Thumb data-slot="switch-thumb" className="thumb"/>
 </Root>;
}
