import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { getApiResponse } from '../api/get-api-response.ts';
import { CliError } from '../cli/cli-error.ts';
import { getRuntimeOptions } from '../cli/runtime-options.ts';
import { writeJson } from '../output/write-json.ts';
import { writeError } from '../output/write-error.ts';
import { CommandUsageError } from './command-usage-error.ts';

const platformSchema = z.enum(['tiktok', 'instagram', 'youtube']);
const accountSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  username: z.string().optional(),
  displayName: z.string().optional(),
  disabled: z.boolean().optional(),
  connectedAt: z.number(),
});
const accountsResponseSchema = z.object({ accounts: z.array(accountSchema) });
const connectionResponseSchema = z.object({ url: z.string(), instructions: z.string() });
const postStateSchema = z.enum(['draft', 'scheduled', 'publishing', 'published', 'failed', 'canceled']);
const analyticsSchema = z.object({
  views: z.number().optional(),
  likes: z.number().optional(),
  comments: z.number().optional(),
  shares: z.number().optional(),
});
const postSchema = z.object({
  id: z.string(),
  platform: platformSchema,
  accountId: z.string(),
  accountUsername: z.string().optional(),
  assetId: z.string(),
  state: postStateSchema,
  publishAt: z.number(),
  publishedAt: z.number().optional(),
  caption: z.string().optional(),
  platformPostUrl: z.string().optional(),
  errorMessage: z.string().optional(),
  analytics: analyticsSchema.optional(),
});
const postsResponseSchema = z.object({ posts: z.array(postSchema) });
const createPostResponseSchema = z.object({
  postId: z.string(),
  state: z.literal('scheduled'),
  publishAt: z.number(),
});
const youtubeOptionsSchema = z.strictObject({
  title: z.string().max(100).optional(),
  privacy_status: z.enum(['public', 'unlisted', 'private']).default('public'),
  tags: z.array(z.string()).max(30).optional(),
  category_id: z.string().optional(),
  made_for_kids: z.boolean().optional(),
});
const tiktokOptionsSchema = z.strictObject({
  privacy_level: z.enum([
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY',
  ]).optional(),
  title: z.string().max(2200).optional(),
  disable_comment: z.boolean().optional(),
  disable_duet: z.boolean().optional(),
  disable_stitch: z.boolean().optional(),
  brand_content_toggle: z.boolean().optional(),
  brand_organic_toggle: z.boolean().optional(),
  is_aigc: z.boolean().optional(),
});
const instagramOptionsSchema = z.strictObject({});
const captionSchema = z.string().max(2200);
const publishAtSchema = z.iso.datetime({ offset: true });

interface CreatePostInput {
  assetId: string | undefined;
  caption: string | undefined;
  connectionId: string | undefined;
  optionsFile: string | undefined;
  platform: string | undefined;
  publishAt: string | undefined;
}

interface CreatePostArgument {
  arguments_: string[];
  index: number;
  input: CreatePostInput;
  seen: Set<string>;
}

export async function runSocial(arguments_: string[]): Promise<number> {
  try {
    const resource = arguments_[0];

    if (resource === 'accounts') {
      await runAccounts(arguments_.slice(1));
      return 0;
    }
    if (resource === 'posts') {
      await runPosts(arguments_.slice(1));
      return 0;
    }
    if (resource === undefined || ((resource === '--help' || resource === '-h') && arguments_.length === 1)) {
      showSocialHelp();
      return 0;
    }
    throw new CommandUsageError(`Unknown social resource: ${resource}`);
  } catch (error) {
    return writeError(error, 'Social command failed.');
  }
}

async function runAccounts(arguments_: string[]): Promise<void> {
  const command = arguments_[0];
  if (command === 'list') {
    if (arguments_.includes('--help')) {
      showAccountCommandHelp(command);
      return;
    }
    await listAccounts(arguments_.slice(1));
    return;
  }
  if (command === 'connect') {
    if (arguments_.includes('--help')) {
      showAccountCommandHelp(command);
      return;
    }
    await connectAccount(arguments_.slice(1));
    return;
  }
  if (command === undefined || ((command === '--help' || command === '-h') && arguments_.length === 1)) {
    showAccountsHelp();
    return;
  }
  throw new CommandUsageError(`Unknown social accounts command: ${command}`);
}

async function listAccounts(arguments_: string[]): Promise<void> {
  const options = getProjectOptions(arguments_, 'accounts list');
  const query = new URLSearchParams({ project_id: options.projectId });
  const response = await getApiResponse({
    method: 'GET', path: 'social/accounts', query, schema: accountsResponseSchema,
  });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }
  if (response.accounts.length === 0) {
    process.stdout.write('No social accounts.\n');
    return;
  }
  for (const account of response.accounts) {
    process.stdout.write(
      `${account.id}\t${account.platform}\t${account.username ?? account.displayName ?? '-'}\t${account.disabled ? 'disabled' : 'connected'}\n`,
    );
  }
}

async function connectAccount(arguments_: string[]): Promise<void> {
  const options = getConnectOptions(arguments_);
  const response = await getApiResponse({
    body: { platform: options.platform, project_id: options.projectId },
    method: 'POST',
    path: 'social/accounts/connections',
    schema: connectionResponseSchema,
  });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }
  process.stdout.write(`${response.url}\n${response.instructions}\n`);
}

function getConnectOptions(arguments_: string[]): {
  platform: z.infer<typeof platformSchema>;
  projectId: string;
} {
  const values = getNamedOptions(arguments_, ['--platform', '--project-id'], 'accounts connect');
  const platform = platformSchema.safeParse(values.get('--platform'));
  if (!values.get('--project-id')) {
    throw new CommandUsageError('Social accounts connect requires --project-id.');
  }
  if (!platform.success) {
    throw new CommandUsageError('Social accounts connect requires --platform tiktok, instagram, or youtube.');
  }
  return {
    platform: platform.data,
    projectId: String(values.get('--project-id')),
  };
}

async function runPosts(arguments_: string[]): Promise<void> {
  const command = arguments_[0];
  const commandArguments = arguments_.slice(1);
  if (command === 'create') {
    if (arguments_.includes('--help')) {
      showPostCommandHelp(command);
      return;
    }
    await createPost(commandArguments);
    return;
  }
  if (command === 'list') {
    if (arguments_.includes('--help')) {
      showPostCommandHelp(command);
      return;
    }
    await listPosts(commandArguments);
    return;
  }
  if (command === 'get') {
    if (arguments_.includes('--help')) {
      showPostCommandHelp(command);
      return;
    }
    await getPostCommand(commandArguments);
    return;
  }
  if (command === 'wait') {
    if (arguments_.includes('--help')) {
      showPostCommandHelp(command);
      return;
    }
    await waitForPost(commandArguments);
    return;
  }
  if (command === 'cancel') {
    if (arguments_.includes('--help')) {
      showPostCommandHelp(command);
      return;
    }
    await cancelPost(commandArguments);
    return;
  }
  if (command === undefined || ((command === '--help' || command === '-h') && arguments_.length === 1)) {
    showPostsHelp();
    return;
  }
  throw new CommandUsageError(`Unknown social posts command: ${command}`);
}

async function createPost(arguments_: string[]): Promise<void> {
  const input = getCreatePostInput(arguments_);
  const options = await getCreatePostOptions(input);
  const response = await getApiResponse({
    body: {
      asset_id: options.assetId,
      platform: options.platform,
      connection_id: options.connectionId,
      ...(options.publishAt === undefined ? {} : { publish_at: options.publishAt }),
      ...(options.caption === undefined ? {} : { caption: options.caption }),
      ...(options.platformOptions === undefined ? {} : { options: options.platformOptions }),
    },
    method: 'POST',
    path: 'social/posts',
    schema: createPostResponseSchema,
  });

  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }
  process.stdout.write(`Created social post ${response.postId} (${response.state}).\n`);
}

function getCreatePostInput(arguments_: string[]): CreatePostInput {
  const input: CreatePostInput = {
    assetId: undefined, caption: undefined, connectionId: undefined,
    optionsFile: undefined, platform: undefined, publishAt: undefined,
  };
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    index = readCreatePostArgument({ arguments_, index, input, seen });
  }
  return input;
}

function readCreatePostArgument(
  values: CreatePostArgument,
): number {
  const argument = values.arguments_[values.index];
  const property = getCreatePostProperty(argument);
  if (!property) {
    throw new CommandUsageError(`Unknown or repeated social posts create option: ${String(argument)}`);
  }
  guardNewOption(values.seen, property, String(argument), 'posts create');
  values.input[property] = getOptionValue(values.arguments_, values.index, String(argument));
  return values.index + 1;
}

function getCreatePostProperty(argument: string | undefined): keyof CreatePostInput | null {
  if (argument === '--asset-id') {
    return 'assetId';
  }
  if (argument === '--caption') {
    return 'caption';
  }
  if (argument === '--connection-id') {
    return 'connectionId';
  }
  if (argument === '--options') {
    return 'optionsFile';
  }
  if (argument === '--platform') {
    return 'platform';
  }
  if (argument === '--publish-at') {
    return 'publishAt';
  }
  return null;
}

async function getCreatePostOptions(input: CreatePostInput): Promise<{
  assetId: string;
  caption: string | undefined;
  connectionId: string;
  platform: z.infer<typeof platformSchema>;
  platformOptions: Record<string, unknown> | undefined;
  publishAt: string | undefined;
}> {
  if (!input.assetId) {
    throw new CommandUsageError('Social posts create requires --asset-id.');
  }
  if (!input.connectionId) {
    throw new CommandUsageError('Social posts create requires --connection-id.');
  }
  const platform = platformSchema.safeParse(input.platform);
  if (!platform.success) {
    throw new CommandUsageError('Social posts create requires --platform tiktok, instagram, or youtube.');
  }
  const caption = captionSchema.safeParse(input.caption);
  if (input.caption !== undefined && !caption.success) {
    throw new CommandUsageError('Social posts --caption must be at most 2200 characters.');
  }
  const publishAt = getPublishAt(input.publishAt);
  const platformOptions = await readPlatformOptions(input.optionsFile, platform.data);
  return {
    assetId: input.assetId,
    caption: caption.data,
    connectionId: input.connectionId,
    platform: platform.data,
    platformOptions,
    publishAt,
  };
}

function getPublishAt(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const publishAt = publishAtSchema.safeParse(value);
  if (!publishAt.success) {
    throw new CommandUsageError('Social posts --publish-at must be an ISO date and time with an offset.');
  }
  return new Date(publishAt.data).toISOString();
}

async function readPlatformOptions(
  optionsFile: string | undefined,
  platform: z.infer<typeof platformSchema>,
): Promise<Record<string, unknown> | undefined> {
  if (optionsFile === undefined) {
    return undefined;
  }
  const text = optionsFile === '-' ? await new Response(Bun.stdin.stream()).text() : await readFile(optionsFile, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CommandUsageError('Social posts --options must contain valid JSON.');
  }
  const schema = platform === 'youtube'
    ? youtubeOptionsSchema
    : platform === 'tiktok' ? tiktokOptionsSchema : instagramOptionsSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new CommandUsageError(`Social posts --options contains invalid ${platform} options.`);
  }
  if (platform === 'youtube') {
    return { youtube: parsed.data };
  }
  if (platform === 'tiktok') {
    return { tiktok: parsed.data };
  }
  return parsed.data;
}

async function listPosts(arguments_: string[]): Promise<void> {
  const options = getListPostOptions(arguments_);
  const query = new URLSearchParams({ project_id: options.projectId, limit: String(options.limit) });
  const response = await getApiResponse({
    method: 'GET', path: 'social/posts', query, schema: postsResponseSchema,
  });
  if (getRuntimeOptions().json) {
    writeJson(response);
    return;
  }
  if (response.posts.length === 0) {
    process.stdout.write('No social posts.\n');
    return;
  }
  for (const post of response.posts) {
    writePostLine(post);
  }
}

function getListPostOptions(arguments_: string[]): { limit: number; projectId: string } {
  const values = getNamedOptions(arguments_, ['--limit', '--project-id'], 'posts list');
  const projectId = values.get('--project-id');
  if (!projectId) {
    throw new CommandUsageError('Social posts list requires --project-id.');
  }
  const limitValue = values.get('--limit') ?? '50';
  const limit = Number(limitValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new CommandUsageError('Social posts --limit must be an integer from 1 to 200.');
  }
  return { limit, projectId };
}

async function getPostCommand(arguments_: string[]): Promise<void> {
  const postId = getPostId(arguments_, 'get');
  guardNoExtraOptions(arguments_, 'get');
  const post = await getPost(postId);
  writePost(post);
}

async function waitForPost(arguments_: string[]): Promise<void> {
  const options = getWaitOptions(arguments_);
  const deadline = Date.now() + options.waitTimeoutSec * 1000;

  while (Date.now() <= deadline) {
    const remainingRequestMs = deadline - Date.now();
    if (remainingRequestMs <= 0) {
      throwWaitTimeout(options.postId, options.waitTimeoutSec);
    }
    const post = await getPostBeforeDeadline({
      deadline,
      postId: options.postId,
      remainingMs: remainingRequestMs,
      waitTimeoutSec: options.waitTimeoutSec,
    });
    if (post.state === 'published') {
      writePost(post);
      return;
    }
    if (post.state === 'failed' || post.state === 'canceled') {
      throw new CliError({
        exitCode: 1,
        message: `Social post ${post.id} ended with state ${post.state}${post.errorMessage ? `: ${post.errorMessage}` : '.'}`,
        type: 'terminal_error',
      });
    }
    writeWaitNotice(post);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throwWaitTimeout(post.id, options.waitTimeoutSec);
    }
    await Bun.sleep(Math.min(options.pollIntervalSec * 1000, remainingMs));
  }
  throwWaitTimeout(options.postId, options.waitTimeoutSec);
}

async function getPostBeforeDeadline(
  arguments_: { deadline: number; postId: string; remainingMs: number; waitTimeoutSec: number },
): Promise<z.infer<typeof postSchema>> {
  try {
    const post = await getPost(arguments_.postId, arguments_.remainingMs);
    if (Date.now() >= arguments_.deadline) {
      throwWaitTimeout(arguments_.postId, arguments_.waitTimeoutSec);
    }
    return post;
  } catch (error) {
    if (Date.now() >= arguments_.deadline) {
      throwWaitTimeout(arguments_.postId, arguments_.waitTimeoutSec);
    }
    throw error;
  }
}

function getWaitOptions(arguments_: string[]): {
  pollIntervalSec: number;
  postId: string;
  waitTimeoutSec: number;
} {
  const postId = getPostId(arguments_, 'wait');
  const values = getNamedOptions(arguments_.slice(1), ['--poll-interval', '--wait-timeout'], 'posts wait');
  return {
    pollIntervalSec: getPositiveNumber(values.get('--poll-interval') ?? '2', '--poll-interval'),
    postId,
    waitTimeoutSec: getPositiveNumber(values.get('--wait-timeout') ?? '600', '--wait-timeout'),
  };
}

async function cancelPost(arguments_: string[]): Promise<void> {
  const postId = getPostId(arguments_, 'cancel');
  guardNoExtraOptions(arguments_, 'cancel');
  await getApiResponse({
    method: 'DELETE',
    path: `social/posts/${encodeURIComponent(postId)}`,
    schema: z.undefined(),
  });
  if (getRuntimeOptions().json) {
    writeJson({ canceled: true, postId });
    return;
  }
  process.stdout.write(`Canceled social post ${postId}.\n`);
}

async function getPost(postId: string, timeoutMs?: number): Promise<z.infer<typeof postSchema>> {
  return getApiResponse({
    method: 'GET',
    path: `social/posts/${encodeURIComponent(postId)}`,
    schema: postSchema,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

function getProjectOptions(arguments_: string[], command: string): { projectId: string } {
  const values = getNamedOptions(arguments_, ['--project-id'], command);
  const projectId = values.get('--project-id');
  if (!projectId) {
    throw new CommandUsageError(`Social ${command} requires --project-id.`);
  }
  return { projectId };
}

function getNamedOptions(
  arguments_: string[],
  names: string[],
  command: string,
): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument && names.includes(argument) && !options.has(argument)) {
      options.set(argument, getOptionValue(arguments_, index, argument));
      index += 1;
      continue;
    }
    throw new CommandUsageError(`Unknown or repeated social ${command} option: ${String(argument)}`);
  }
  return options;
}

function guardNoExtraOptions(arguments_: string[], command: string): void {
  if (arguments_.length > 1) {
    throw new CommandUsageError(`Unknown or repeated social posts ${command} option: ${String(arguments_[1])}`);
  }
}

function getPostId(arguments_: string[], command: string): string {
  const postId = arguments_[0];
  if (!postId || postId.startsWith('-')) {
    throw new CommandUsageError(`Social posts ${command} requires <post-id>.`);
  }
  return postId;
}

function guardNewOption(seen: Set<string>, property: string, option: string, command: string): void {
  if (seen.has(property)) {
    throw new CommandUsageError(`Unknown or repeated social ${command} option: ${option}`);
  }
  seen.add(property);
}

function getOptionValue(arguments_: string[], index: number, option: string): string {
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new CommandUsageError(`${option} requires a value.`);
  }
  return value;
}

function getPositiveNumber(value: string, option: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new CommandUsageError(`${option} must be a positive number.`);
  }
  return number;
}

function writePost(post: z.infer<typeof postSchema>): void {
  if (getRuntimeOptions().json) {
    writeJson(post);
    return;
  }
  writePostLine(post);
}

function writePostLine(post: z.infer<typeof postSchema>): void {
  process.stdout.write(
    `${post.id}\t${post.platform}\t${post.state}\t${post.accountUsername ?? post.accountId}\t${post.platformPostUrl ?? '-'}\n`,
  );
}

function writeWaitNotice(post: z.infer<typeof postSchema>): void {
  if (getRuntimeOptions().nonInteractive || !process.stderr.isTTY) {
    return;
  }
  process.stderr.write(`Waiting for social post ${post.id}: ${post.state}.\n`);
}

function throwWaitTimeout(postId: string, waitTimeoutSec: number): never {
  throw new CliError({
    exitCode: 4,
    message: `Timed out waiting for social post ${postId} after ${String(waitTimeoutSec)} seconds.`,
    type: 'timeout_error',
  });
}

function showSocialHelp(): void {
  process.stdout.write(`Usage: viewpress social <resource> <command>\n\nResources:\n  accounts list|connect\n  posts create|list|get|wait|cancel\n`);
}

function showAccountsHelp(): void {
  process.stdout.write(`Usage: viewpress social accounts <command>\n\nCommands:\n  list --project-id <id> [--json]\n  connect --project-id <id> --platform <platform> [--json]\n`);
}

function showAccountCommandHelp(command: 'connect' | 'list'): void {
  if (command === 'list') {
    process.stdout.write('Usage: viewpress social accounts list --project-id <id> [--json]\n');
    return;
  }

  process.stdout.write('Usage: viewpress social accounts connect --project-id <id> --platform <platform> [--json]\n');
}

function showPostsHelp(): void {
  process.stdout.write(`Usage: viewpress social posts <command>\n\nCommands:\n  create --asset-id <id> --platform <platform> --connection-id <id> [--publish-at <ISO>] [--caption <text>] [--options <file|->] [--json]\n  list --project-id <id> [--limit <1..200>] [--json]\n  get <post-id> [--json]\n  wait <post-id> [--wait-timeout <seconds>] [--poll-interval <seconds>] [--json]\n  cancel <post-id> [--json]\n`);
}

function showPostCommandHelp(command: 'cancel' | 'create' | 'get' | 'list' | 'wait'): void {
  if (command === 'create') {
    process.stdout.write('Usage: viewpress social posts create --asset-id <id> --platform <platform> --connection-id <id> [--publish-at <ISO>] [--caption <text>] [--options <file|->] [--json]\n');
    return;
  }
  if (command === 'list') {
    process.stdout.write('Usage: viewpress social posts list --project-id <id> [--limit <1..200>] [--json]\n');
    return;
  }
  if (command === 'wait') {
    process.stdout.write('Usage: viewpress social posts wait <post-id> [--wait-timeout <seconds>] [--poll-interval <seconds>] [--json]\n');
    return;
  }

  process.stdout.write(`Usage: viewpress social posts ${command} <post-id> [--json]\n`);
}
