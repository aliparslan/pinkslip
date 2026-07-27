let returnRoute = "/";

export function setJobDetailReturnRoute(route: string) {
  returnRoute = route || "/";
}

export function getJobDetailReturnRoute(): string {
  return returnRoute;
}
