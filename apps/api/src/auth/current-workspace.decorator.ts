import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const WorkspaceId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest();
    return (req.headers["x-workspace-id"] as string) || req.user?.workspaceId || "default-workspace";
  },
);
