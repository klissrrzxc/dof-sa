import {randomUUID} from 'node:crypto';
import {OperationFormClient} from './operation-form-client';
import type {Field,OperationName} from '@/lib/operations';
export function OperationForm(props:{op:OperationName;target?:string;title:string;fields?:Field[]}){return <OperationFormClient {...props} requestKey={randomUUID()}/>;}
