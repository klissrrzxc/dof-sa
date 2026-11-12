export class RouteSignal extends Error{constructor(public route:string){super(route);}}
export function redirect(path:string):never{throw new RouteSignal(path);}
export function forbidden():never{throw new RouteSignal('403');}
export function notFound():never{throw new RouteSignal('404');}
export function usePathname(){return location.hash.slice(1).split(/[?#]/)[0]||'/login';}
