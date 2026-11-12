'use client';
import {useState} from 'react';
export function CopyBBCode({text}:{text:string}){const [message,setMessage]=useState('');return <><button onClick={async()=>{try{await navigator.clipboard.writeText(text);setMessage('BBCode скопирован. Публикация на форуме выполняется вручную.');}catch{setMessage('Буфер недоступен. Выделите текст и скопируйте вручную.');}}}>Скопировать BBCode</button><p role="status">{message}</p></>;}
