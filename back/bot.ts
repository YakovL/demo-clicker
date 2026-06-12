import { Bot, InlineKeyboard } from 'grammy';
import { usersRepository } from './users/repository';
import { env } from './config';
import { issueLogger } from './issueLogger';

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.command('start', async (ctx) => {
  const user = ctx.from;
  if (!user) return;
  const tgId = user.id;
  const title = `${user.first_name} ${user.last_name || ''}`.trim();

  const findResult = await usersRepository.findById(tgId);

  if (findResult.error) {
    issueLogger.log(`bot/start/findUser for ${tgId}`,
      findResult.error,
      findResult.originalError);
    await ctx.reply('Sorry, there was an error. Please try again later.');
    return;
  }

  if (!findResult.user) {
    const createResult = await usersRepository.create(tgId, title);

    if (createResult.error) {
      issueLogger.log(`bot/start/createUser for ${tgId}`,
        createResult.error,
        createResult.originalError);
      await ctx.reply('Sorry, there was an error. Please try again later.');
      return;
    }
  }

  await ctx.reply('Welcome! Press the button to open the clicker:', {
    reply_markup: new InlineKeyboard()
      .webApp('Open Clicker', { url: env.TELEGRAM_TMA_URL })
  });
});

bot.start();
