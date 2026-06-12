import { Bot, InlineKeyboard } from 'grammy';
import { usersRepository } from './users/repository';
import { env } from './config';

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

bot.command('start', async (ctx) => {
  const user = ctx.from;
  if (!user) return;
  const tgId = user.id;
  const title = `${user.first_name} ${user.last_name || ''}`.trim();

  const findResult = await usersRepository.findById(tgId);

  if (findResult.error) {
    console.error('Error finding user:', findResult.error, findResult.originalError);
    await ctx.reply('Sorry, there was an error. Please try again later.');
    return;
  }

  if (!findResult.user) {
    const createResult = await usersRepository.create(tgId, title);

    if (createResult.error) {
      console.error('Error creating user:', createResult.error, createResult.originalError);
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
