console.error(`${process.argv[2] ?? '此入口'} 尚未实现，不能报告测试、打包或部署成功。请按开发计划继续。`);
process.exitCode = 1;
