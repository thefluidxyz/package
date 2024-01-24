export const Footer: React.FC = () => {
    return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-[#E1B1FF] px-5 sm:px-9 md:px-[56px] lg:px-[76px] mt-[42px]">
            <div className="flex flex-row items-center text-[35px] font-medium gap-2 text-[#0B1722] py-[9px] pt-[21px] sm:py-[36px]">
                <img src="./dark-fluid-logo.png" className="w-[28px] h-[28px]" />
                Fluid
            </div>
            <div className="flex flex-row items-center justify-center gap-5 py-[9px] pb-[35px] sm:p-0">
                <img src="./icons/x.png" className="w-[42px] h-[42px]" />
                <img src="./icons/telegram.png" className="w-[42px] h-[42px]" />
                <img src="./icons/github.png" className="w-[42px] h-[42px]" />
                <img src="./icons/speaker.png" className="w-[42px] h-[42px]" />
                <img src="./icons/documentation.png" className="w-[42px] h-[42px]" />
            </div>
        </div>
    )
}