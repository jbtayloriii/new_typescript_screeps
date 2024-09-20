

export const handleFlagCommand = function(flag:Flag){
    switch(flag.name) {
        case "test":
            testFlag(flag);
            break;
    }
}

function testFlag(flag:Flag) {
    console.log("Testing the flag");
    flag.remove();
}